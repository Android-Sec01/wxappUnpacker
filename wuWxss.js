const wu=require("./wuLib.js");
const path=require("path");
const {VM}=require('vm2');
const cssbeautify=require('cssbeautify');
const csstree=require('css-tree');
let pureData={},result={},actualPure={},onlyTest=true,blockCss=[];//block css file which won't be imported by others.
function cssRebuild(data){//need to bind this as {cssFile:__name__} before call
	let cssFile=this.cssFile;
    function makeup(data){
        var isPure=typeof data==="number";
		if(onlyTest){
			if(!isPure){
				if(data.length==1&&data[0][0]==2)data=data[0][1];
				else return "";
			}
			if(!actualPure[data]&&!blockCss.includes(cssFile)){
				console.log("Regard "+cssFile+" as pure import file.");
				actualPure[data]=cssFile;
			}
			return "";
		}
        if(isPure&&actualPure[data]!=cssFile)return '@import "'+wu.changeExt(wu.toDir(actualPure[data],cssFile),".wxss")+'";\n';
        let exactData=isPure?pureData[data]:data;
        let res=[];
		for(let content of exactData)
			if(typeof content==="object"){
				switch(content[0]){
				case 0://rpx
					res.push(content[1]+"rpx");
					break;
				case 1://add suffix, ignore it for restoring correct!
					break;
				case 2://import
					res.push(makeup(content[1]));
					break;
				}
			}else res.push(content);
        return res.join("");
    }
    return ()=>{
		if(!result[cssFile])result[cssFile]="";
		result[cssFile]+=makeup(data);
    };
}
function runVM(name,code){
	let vm=new VM({sandbox:{setCssToHead:cssRebuild.bind({cssFile:name})}});
	vm.run(code);
}
let runList={};
function preRun(dir,frameFile,mainCode,files,cb){
	wu.addIO(cb);
	runList[path.resolve(dir,"./app.wxss")]=mainCode;
	for(let name of files)if(name!=frameFile){
		wu.get(name,code=>{
			code=code.slice(0,code.indexOf("\n"));
			if(code.indexOf("setCssToHead")>-1)runList[name]=code.slice(code.indexOf("setCssToHead"));
		});
	}
}
function runOnce(test){
	onlyTest=test;
	for(let name in runList)runVM(name,runList[name]);
}
function transformCss(style){
	let ast=csstree.parse(style);
	csstree.walk(ast,function(node){
		if(node.type=="TypeSelector"){
			if(node.name.startsWith("wx-"))node.name=node.name.slice(3);
			else if(node.name=="body")node.name="page";
		}
		if(node.children){
			let list={};
			node.children.each((son,item)=>{
				if(son.type=="Declaration"){
					if(list["-webkit-"+son.property])node.children.remove(list["-webkit-"+son.property]);
					else if(list[son.property]){
						let thisValue=son.value.children.head&&son.value.children.head.data.name;
						if(list[son.property].data.value.children.head&&list[son.property].data.value.children.head.data.name=="-webkit-"+thisValue)node.children.remove(list[son.property]);
					}
					list[son.property]=item;
				}
			});
		}
	});
	return cssbeautify(csstree.generate(ast),{indent:'    ',autosemicolon:true});
}
function doWxss(dir,cb){
	wu.scanDirByExt(dir,".html",files=>{
		let frameFile=path.resolve(dir,"./page-frame.html");
		wu.get(frameFile,code=>{
			code=code.slice(code.indexOf('var setCssToHead = function(file, _xcInvalid) {'));
			code=code.slice(code.indexOf('\nvar _C= ')+1);
			let oriCode=code;
			code=code.slice(0,code.indexOf('\n'));
			let vm=new VM({sandbox:{}});
			pureData=vm.run(code+"\n_C");
			let mainCode=oriCode.slice(oriCode.indexOf("setCssToHead"),oriCode.lastIndexOf(";var __pageFrameEndTime__"));
			console.log("Guess wxss(first turn)...");
			preRun(dir,frameFile,mainCode,files,()=>{
				runOnce(true);
				console.log("Guess wxss(first turn) done.\nGenerate wxss(second turn)...");
				runOnce(false)
				console.log("Generate wxss(second turn) done.\nSave wxss...");
				for(let name in result)wu.save(wu.changeExt(name,".wxss"),transformCss(result[name]));
				let delFiles={};
				for(let name of files)delFiles[name]=name==frameFile?4:8;
				cb(delFiles);
			});
		});
	});
}
module.exports={doWxss:doWxss};
if(require.main===module){
    wu.commandExecute(doWxss,"Restore wxss files.\n\n<dirs...>\n\n<dirs...> restore wxss file from a unpacked directory(Have page-frame.html and other html file).");
}
