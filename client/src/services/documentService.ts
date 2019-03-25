import axios from 'axios';
import * as State from '../definitions/state'
import * as Langs from '../definitions/languages'
import { markdownLanguagePlugin } from '../languages/markdown'
import { externalLanguagePlugin } from '../languages/external'
import { javascriptLanguagePlugin } from '../languages/javascript'
import { connect } from 'tls';

interface DocumentElement {
  language: string
  source: string
}

async function getDocument(paragraph:string): Promise<DocumentElement[]> {
  function getCellCode(language: string, codeCell: string) : DocumentElement {
    let languageMarker = "```".concat(language)
    let languageMarkerBegin = codeCell.indexOf(languageMarker)
    if (languageMarkerBegin > -1)
    {
      let languageMarkerEnd = codeCell.indexOf("```", languageMarkerBegin+languageMarker.length+1)
      let source = codeCell.substring(languageMarkerBegin+languageMarker.length,languageMarkerEnd).trim()
      return {language: language, source: source }
    }
    return {language: language, 
      source: "Unknown language: \n"+codeCell}
  }

  function getCellLanguage(codeCell: string) {
    let listOfLanguages = ["javascript", "python", "racket", "r", "thegamma"] 
    for (var l = 0; l < listOfLanguages.length; l++) {
      let languageMarker = "```".concat(listOfLanguages[l])
      let languageMarkerBegin = codeCell.indexOf(languageMarker)
      if (languageMarkerBegin > -1) {
        return listOfLanguages[l]
      }
    }
    return "markdown";
  }
  
  let documents : DocumentElement[] = []; 
  var regex = /```[a-z]+[^`]*```/g;
  var res; 
  var currentPos = 0;
  
  while(res = regex.exec(paragraph)) {
    let start = res.index;
    let end = res.index+res[0].length;
    if (currentPos < start) {
      documents.push({language: "markdown", source: paragraph.substring(currentPos, start)})
    }
    let cell = paragraph.substring(start, end);
    let cellLanguage = getCellLanguage(cell);
    let cellCode = getCellCode(cellLanguage, cell);
    documents.push(cellCode);
    currentPos = end
  }

  if (currentPos < paragraph.length-1) {
    documents.push({language: "markdown", source: paragraph.substring(currentPos)})
  }
  return documents;
}

async function getNamedDocument(): Promise<DocumentElement[]> {
    async function getDocumentMd(sourceFile: string) : Promise<string> {
      let sourceURL = "/".concat(sourceFile).concat(".md")
      let response = await axios.get(sourceURL)
      // let response = await axios.get("http://localhost:8080/sample.md")
      return response.data
    }

    let sourceFile = "index"
    if (window.location.search.slice(1).length > 0){
      sourceFile = window.location.search.slice(1)
    }
    let paragraph = await getDocumentMd(sourceFile) 
    return getDocument(paragraph)
}

function saveDocument(state:State.NotebookState):string
{
  let content:string = ""
  var languagePlugins : { [language: string]: Langs.LanguagePlugin; } = { };
  languagePlugins["markdown"] = markdownLanguagePlugin;
  languagePlugins["javascript"] = javascriptLanguagePlugin;
  languagePlugins["python"] = new externalLanguagePlugin("python", "PYTHONSERVICE_URI");
  languagePlugins["r"] = new externalLanguagePlugin("r", "RSERVICE_URI");
  languagePlugins["racket"] = new externalLanguagePlugin("racket", "RACKETSERVICE_URI");
  for (let c = 0; c < state.cells.length; c++){
    content = content.concat(languagePlugins[state.cells[c].editor.block.language].save(state.cells[c].editor.block))
  }
  return content
}
  
export {
  getDocument,
  getNamedDocument,
  DocumentElement,
  saveDocument
}
