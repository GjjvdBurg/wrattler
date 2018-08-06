import * as monaco from 'monaco-editor';
import {h,createProjector,VNode} from 'maquette';
// import marked from 'marked';
import * as Langs from '../../languages'; 
import * as Graph from '../../graph'; 

const ts = require('typescript');

//const s = require('./editor.css');


// ------------------------------------------------------------------------------------------------
// Markdown plugin
// ------------------------------------------------------------------------------------------------

/// A class that represents a Markdown block. All blocks need to have 
/// `language` and Markdown also keeps the Markdown source we edit and render

class JavascriptBlockKind implements Langs.Block {
    language : string;
    source : string;
    constructor(source:string) {
      this.language = "javascript";
      this.source = source;
    }
  }
  
  function getCodeExports(scopeDictionary: {}, source: string): Promise<{code: Graph.Node, exports: Graph.ExportNode[]}> {
    return new Promise<{code: Graph.Node, exports: Graph.ExportNode[]}>(resolve => {
      let tsSourceFile = ts.createSourceFile(
        __filename,
        source,
        ts.ScriptTarget.Latest
      );
      let tree = [];
      for (var n=0; n < tsSourceFile.statements.length; n++){
        let node = tsSourceFile.statements[n];
        // console.log(node)
        switch (node.kind) {
          case 212: {
              tree.push({
                kind: 212,
                name: node.declarationList.declarations[0].name,
                initializer: node.declarationList.declarations[0].initializer
              });
            break
          }
          case 214: {
            tree.push({
              kind: 214,
              expression: node.expression});
            break;
          }
        }
      }
      let dependencies:Graph.JsExportNode[] = [];
      let node:Graph.JsCodeNode = {
        language:"javascript", 
        antecedents:[],
        exportedVariables:[],
        kind: 'code',
        value: undefined,
        source: source
      }
      for (var s = 0; s < tree.length; s++) {
        let statement = tree[s];
        if (statement.kind == 212){
          let name = statement.name.escapedText
          let exportNode:Graph.JsExportNode = {
            variableName: name,
            value: undefined,
            language:"javascript",
            code: node, 
            kind: 'export',
            antecedents:[node]
            };
          dependencies.push(exportNode);
          node.exportedVariables.push(exportNode.variableName);
          
          tokenizeStatement(statement.initializer.left, node, scopeDictionary)
          tokenizeStatement(statement.initializer.right, node, scopeDictionary)
        }
      }
      resolve({code: node, exports: dependencies});
      // return new Promise<{code: Graph.Node, exports: Graph.ExportNode[]}>(resolve => {
      //   setTimeout(() => {
      //     resolve({code: node, exports: dependencies});
      //   }, 0);
      // });
    });
  }

  interface JavascriptEditEvent { kind:'edit' }
  interface JavascriptUpdateEvent { kind:'update', source:string }
  type JavascriptEvent = JavascriptEditEvent | JavascriptUpdateEvent
  
  type JavascriptState = {
    id: number
    block: JavascriptBlockKind
    editing: boolean
  }
  
  const javascriptEditor : Langs.Editor<JavascriptState, JavascriptEvent> = {
    initialize: (id:number, block:Langs.Block) => {  
      return { id: id, block: <JavascriptBlockKind>block, editing: false }
    },
  
    update: (state:JavascriptState, event:JavascriptEvent) => {
      switch(event.kind) {
        case 'edit': 
          // console.log("Javascript: Switch to edit mode!")
          return { id: state.id, block: state.block, editing: true }
        case 'update': 
          // console.log("Javascript: Set code to:\n%O", event.source);
          let newBlock = javascriptLanguagePlugin.parse(event.source)
          return { id: state.id, block: <JavascriptBlockKind>newBlock, editing: false }
      }
    },

    render: (cell: Langs.BlockState, state:JavascriptState, context:Langs.EditorContext<JavascriptEvent>) => {
      let evalButton = h('button', { onclick:() => context.evaluate(cell) }, ["Evaluate"])
      console.log(cell)
      // function display() {
      //   if (cell.code == undefined)
      //     if (cell.code == undefined)
      // }
      let results = h('div', {}, [
        h('p', {
            style: "height:75px; position:relative", 
            onclick:() => context.trigger({kind:'edit'})
          }, 
          [ ((cell.code==undefined)||(cell.code.value==undefined)) ? evalButton : ("Value is: " + JSON.stringify(cell.code.value)) ]),
          // [ cell.code==undefined ? evalButton : ("Value is: ") ]),
      ]);
 
      let afterCreateHandler = (el) => { 
        let ed = monaco.editor.create(el, {
          value: state.block.source,
          language: 'javascript',
          scrollBeyondLastLine: false,
          theme:'vs',
          minimap: { enabled: false },
          overviewRulerLanes: 0,
          lineDecorationsWidth: "0ch",
          fontSize: 14,
          fontFamily: 'Monaco',
          lineNumbersMinChars: 2,
          lineHeight: 20,
          lineNumbers: "on",
          scrollbar: {
            verticalHasArrows: true,
            horizontalHasArrows: true,
            vertical: 'none',
            horizontal: 'none'
          }
        });    

        ed.createContextKey('alwaysTrue', true);
        ed.addCommand(monaco.KeyCode.Enter | monaco.KeyMod.Shift,function (e) {
          let code = ed.getModel().getValue(monaco.editor.EndOfLinePreference.LF)
          context.trigger({kind: 'update', source: code})
        }, 'alwaysTrue');

        let lastHeight = 100;
        let lastWidth = 0
        let resizeEditor = () => {
          let lines = ed.getModel().getValue(monaco.editor.EndOfLinePreference.LF, false).split('\n').length
          let height = lines > 4 ? lines * 20.0 : 80;
          let width = el.clientWidth

          if (height !== lastHeight || width !== lastWidth) {
            lastHeight = height
            lastWidth = width  
            ed.layout({width:width, height:height})
            el.style.height = height + "px"
          }
        }
        ed.getModel().onDidChangeContent(resizeEditor);
        window.addEventListener("resize", resizeEditor)
        setTimeout(resizeEditor, 100)
      }
      let code = h('div', { style: "height:100px; margin:20px 0px 10px 0px;", id: "editor_" + cell.editor.id.toString(), afterCreate:afterCreateHandler }, [ ])
      return h('div', { }, [code, results])
    }
  }
  
  function tokenizeStatement (argument:any, node:Graph.JsCodeNode, scopeDictionary:{}) {
    if (argument != undefined) {
      if (argument.expression != undefined){
        tokenizeStatement(argument.expression.left, node, scopeDictionary)
        tokenizeStatement(argument.expression.right, node, scopeDictionary)
      }
      else {
        let argumentName = argument.text
        if (argumentName in scopeDictionary) {
          let antecedentNode = scopeDictionary[argumentName]
          node.antecedents.push(antecedentNode);
        }
      }
    }
  }

  export const javascriptLanguagePlugin : Langs.LanguagePlugin = {
    language: "javascript",
    editor: javascriptEditor,
    evaluate: (node:Graph.Node) => {
      let jsnode = <Graph.JsNode>node
      let value = "yadda";
      let returnArgs = "{";
      let evalCode = "";
      switch(jsnode.kind) {
        case 'code': 
          let jsCodeNode = <Graph.JsCodeNode>node
          console.log(jsCodeNode);
          for (var e = 0; e < jsCodeNode.exportedVariables.length; e++) {
            returnArgs= returnArgs.concat(jsCodeNode.exportedVariables[e]+":"+jsCodeNode.exportedVariables[e]+",");
          }
          returnArgs = returnArgs.concat("}")
          let importedVars = "";
          var argDictionary:{[key: string]: string} = {}
          for (var i = 0; i < jsCodeNode.antecedents.length; i++) {
            let imported = <Graph.JsExportNode>jsCodeNode.antecedents[i]
            argDictionary[imported.variableName] = imported.value;
            importedVars = importedVars.concat("\nlet "+imported.variableName + " = args[\""+imported.variableName+"\"];");
          }
          evalCode = "function f(args) {\n\t "+ importedVars + "\n"+jsCodeNode.source +"\n\t return "+returnArgs+"\n}; f(argDictionary)"
          console.log(evalCode)
          value = eval(evalCode);
          break;
        case 'export':
          let jsExportNode = <Graph.JsExportNode>node
          let exportNodeName= jsExportNode.variableName;
          value = jsExportNode.code.value[exportNodeName]
          console.log(value);
          break;
      }
      return value
    },
    parse: (code:string) => {
      return new JavascriptBlockKind(code);
    },
    bind: (scopeDictionary: {}, block: Langs.Block) => {
      let jsBlock = <JavascriptBlockKind>block
      return getCodeExports(scopeDictionary, jsBlock.source);
    }
  }

  