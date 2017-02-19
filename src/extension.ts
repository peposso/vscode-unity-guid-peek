'use strict';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as fs   from 'fs';
import * as path from 'path';

var guidDictionary: {[guid: string]: {path:string}} = null;

function readdir(dir: string): Promise<Array<string>> {
  return new Promise((resolve, reject)=> {
    fs.readdir(dir, (err, files)=> {
      if (err) {
        reject([]);
      } else {
        resolve(files);
      }
    });
  });
}

function readFile(file: string): Promise<string> {
  return new Promise((resolve, reject)=> {
    fs.readFile(file, (err, content)=> {
      if (err) {
        reject(err);
      } else {
        resolve(content);
      }
    });
  });
}

async function walkMeta(root: string) {
  let files = await readdir(root);
  for (let file of files) {
    let fullPath = path.join(root, file);
    var stat = fs.statSync(fullPath);
    if (stat == null) continue;

    if (stat.isDirectory()) {
      await walkMeta(fullPath);
      continue;
    }

    var ext = path.extname(file).toLowerCase();
    if (ext != ".meta") { continue; }
    let content = await readFile(fullPath);
    try {
      var meta = yaml.load(content);
    } catch(err) {
      continue;
    }
    var guid = meta['guid'];
    if (guid && !meta['folderAsset']) {
      let projPath = fullPath.slice(vscode.workspace.rootPath.length + 1).slice(0, -5);
      guidDictionary[guid] = {
        path: projPath,
      };
    }
  }
}

async function getInfo(guid: string) {
  if (guidDictionary == null) {
    guidDictionary = {};
    await walkMeta(vscode.workspace.rootPath);
  }
  return guidDictionary[guid];
}

function isGUID(word: string) {
  // 0ef2e22c39155c943b015dcf2f79bb99
  return word.length == 32 && /^[0-9a-f]+$/.test(word);
}

class UnityGuidDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument,
                          position: vscode.Position,
                          token: vscode.CancellationToken): Promise<vscode.Definition> {
    //
    var word = document.getText(document.getWordRangeAtPosition(position));
    if (!isGUID(word)) return null;

    var info = await getInfo(word);
    if (!info || !info.path) return null;

    var fullPath = path.join(vscode.workspace.rootPath, info.path);
    if (!fs.existsSync(fullPath)) return null;

    return new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(0, 0));
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vscode-unity-guid-peek" is now active!');

  var root = vscode.workspace.rootPath;
  if (!root || !fs.existsSync(path.join(root, "Assets"))) {
    return;
  }
  
  let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
    vscode.window.showInformationMessage('Hello World!');
    (async ()=> {
      let langs = await vscode.languages.getLanguages();
      console.log(langs);
    })();
  });
  
  let config = vscode.workspace.getConfiguration('unity_guid_peek');
  let activeLanguages = (config.get('activeLanguages') as Array<string>);
  
  const filter: vscode.DocumentFilter[] = activeLanguages.map((language) => {
    return {
      language: language,
      scheme: 'file'
    };
  });
  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      filter, new UnityGuidDefinitionProvider()));
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(filter, {
        async provideHover(document, position, token) {
          var word = document.getText(document.getWordRangeAtPosition(position));
          if (isGUID(word)) {
            var info = await getInfo(word);
            if (info) {
              return new vscode.Hover(info.path);
            } else {
              return new vscode.Hover('Missing');
            }
          }
          return null;
        }
    }));
}

export function deactivate() {
  guidDictionary = null;
}
