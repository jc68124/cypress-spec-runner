const {app,BrowserWindow,shell,dialog,nativeImage,clipboard}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const installed=process.env.SPEC_RUNNER_PACKAGE,root=__dirname;
const second=process.env.SPEC_RUNNER_SMOKE_PHASE==='history';
const icon=nativeImage.createFromPath(path.join(installed,'assets',process.platform==='win32'?'icon.ico':'icon.png'));
if(icon.isEmpty()||icon.getSize().width<16)throw Error('Packaged icon missing');
const openedLogs=[],revealedLogs=[],openedArtifacts=[];
shell.showItemInFolder=file=>revealedLogs.push(file);
shell.openPath=async file=>{if(file.endsWith('.log')){openedLogs.push(file);return !second&&openedLogs.length===1?'No default application is configured.':'';}openedArtifacts.push(file);return '';};
dialog.showSaveDialog=async()=>{throw Error('Saved logs must open without a save dialog');};
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'portable browser')]});
dialog.showErrorBox=(title,message)=>{console.error(title,message);app.exit(1);};
let taskbarDetails;
if (process.platform === 'win32') {
    const setAppDetails = BrowserWindow.prototype.setAppDetails;
    const samePath = (left, right) => path.relative(fs.realpathSync.native(left), fs.realpathSync.native(right)) === '';
    BrowserWindow.prototype.setAppDetails = function (details) {
        if (this.isVisible()) throw Error('Taskbar details were set after showing the window');
        if (details.appId !== 'CypressSpecRunner.Desktop' || details.relaunchDisplayName !== 'Cypress Spec Runner') {
            throw Error('Windows taskbar app identity is wrong');
        }
        if (details.appIconIndex !== 0 || !samePath(details.appIconPath, path.join(installed, 'assets', 'icon.ico'))) {
            throw Error('Windows taskbar details did not use the packaged icon');
        }
        const command = /^"([^"]+)" "([^"]+)" "--spec-runner-project=([^"]+)"$/.exec(details.relaunchCommand);
        if (!command || !samePath(command[1], process.execPath) || !samePath(command[2], installed) || !samePath(command[3], root)) {
            throw Error('Windows taskbar relaunch command did not use the app and checkout');
        }
        setAppDetails.call(this, details);
        taskbarDetails = details;
    };
}
const original=BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile=async function(...args){
    const loaded=await original.apply(this,args),win=this;
    setTimeout(async()=>{
        try{
            if (process.platform === 'win32' && !taskbarDetails) throw Error('Windows taskbar icon was not configured');
            const execute=name=>win.webContents.executeJavaScript(fs.readFileSync(path.join(root,name),'utf8'));
            if(second){const value=await execute('package-history-check.cjs');if(!fs.existsSync(value.logPath)||!openedLogs.includes(value.logPath)||!openedArtifacts.length)throw Error('Historical log/artifacts unavailable after restart');console.log('HISTORY_REOPENED:'+JSON.stringify(value));app.exit(0);return;}
            const result=await execute('package-run-check.cjs');
            if(app.getName()!=='Cypress Spec Runner')throw Error('Native app name is not friendly');
            if(openedLogs.length!==2||openedLogs.some(file=>file!==result.logPath)||revealedLogs[0]!==result.logPath||!openedArtifacts.length)throw Error('Log/artifact shortcuts did not use owned paths');
            if((await clipboard.readText()).replace(/\r\n/g,'\n')!==result.matrix[0].output.replace(/\r\n/g,'\n'))throw Error('Copy output did not use full log');
            for(let index=0;index<6;index++)fs.writeFileSync(path.join(root,'cypress/e2e/split-'+index+'.cy.ts'),'');
            let changed=false;
            for(let index=0;index<150;index++){changed=await win.webContents.executeJavaScript("!!document.querySelector('[aria-label=\"Spec changes detected\"]')");if(changed)break;await new Promise(resolve=>setTimeout(resolve,100));}
            if(!changed)throw Error('Filesystem edit did not reach the refresh indicator');
            result.historyCount=await execute('package-split-check.cjs');
            for(const name of ['progress-pass.cy.ts','progress-failed.cy.ts'])fs.writeFileSync(path.join(root,'cypress/e2e',name),'');
            result.historyCount=await execute('package-progress-check.cjs');
            if(await win.webContents.executeJavaScript("!!document.querySelector('[aria-label=\"Spec changes detected\"]')"))throw Error('Refresh did not clear change indicator');
            const metadata=fs.readFileSync(path.join(root,'spec-runner-logs',result.id,'run.json'),'utf8');
            if(metadata.includes('raw_config_secret_do_not_store')||metadata.includes('"command"')||metadata.includes('"output"'))throw Error('History stored raw config, command or output');
            console.log('PACKAGED_RUN:'+JSON.stringify(result));app.exit(0);
        }catch(error){console.error(error);app.exit(1);}
    },30);
    return loaded;
};
require(path.join(installed,'out/electron/main.js'));
