import * as CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/groovy/groovy';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/fold/brace-fold';
import '../src';
import '../src/index.css'
import { IXmlMixedOptions } from '../src';

function registerTrigger(onPageInit?: () => void, onPageChange?: () => void) {
  document.addEventListener('DOMContentLoaded', function() {
    onPageInit && onPageInit();
    const callback = function(mutationsList) {
      for (let i = 0, len = mutationsList.length; i < len; i++) {
        if (mutationsList[i].type == 'childList') {
          onPageChange && onPageChange();
          break;
        }
      }
    };

    const observer = new MutationObserver(callback);
    const config = { childList: true, subtree: false };
    observer.observe(document.getElementById('root')!, config);
  }, false);
}

export default {
  title: 'Demo',
};

type OptionsType = {
  [name: string]: CodeMirror.EditorConfiguration & {
    mode: 'xmlmixed' | IXmlMixedOptions,
    content: string
  },
}

const CONTENT = `
<Root>
  <Src>
    CodeMirror.fromTextArea(textArea, {
      mode: {
        name: 'xmlmixed',
        decideMode(tag) {
          if ('SRC' === tag.name.toUpperCase()) {
            return {
              name: 'javascript',
              mode: "text/typescript",
            };
          }
          if ('CODE' === tag.name.toUpperCase()) {
            return tag.attributes['language'] || 'javascript';
          }
        }
      },
    });
  </Src>
  <!-- not spec language, use default javascript -->
  <Code>
    // javascript code
    const a = 1;
    const b = 2;
    const plus = (a, b) => a + b;
    plus(a, b);
  </Code>
  <!-- without cdata tag -->
  <Code language="groovy">
    // groovy code
    def a = 1
    def b = "text"
    return "\${a}-\${b}"
  </Code>
  <!-- with cdata tag -->
  <Code language="groovy">
    <![CDATA[
    // groovy code
    def a = 1
    def b = "text"
    def c = 3
    if (a < c) {
      return "\${a}-\${b}"
    } else {
      return "\${b}-\${a}"
    }
    ]]>
  </Code>
</Root>`;

const Options: OptionsType = {
  base: {
    mode: {
      name: 'xmlmixed',
      decideMode(tag) {
        if ('SRC' === tag.name.toUpperCase()) {
          return {
            name: 'javascript',
            mode: 'text/typescript',
          };
        }
        if ('CODE' === tag.name.toUpperCase()) {
          return tag.attributes['language'] || 'javascript';
        }
      }
    },
    lineNumbers: true,
    autoCloseBrackets: true,
    autoCloseTags: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    content: CONTENT,
  },
};

// noinspection JSUnusedGlobalSymbols
export const XmlMixedMode = () => {
  const textAreaElement = document.createElement('textarea');
  textAreaElement.id = 'codemirror-base';
  return textAreaElement;
};

registerTrigger(undefined, () => {
  for (const name of Object.keys(Options)) {
    const { content, ...option } = Options[name];
    const textArea: HTMLTextAreaElement = document.getElementById(`codemirror-${name}`) as HTMLTextAreaElement;
    if (textArea && textArea.style.display !== 'none') {
      const cm = CodeMirror.fromTextArea(textArea, option);
      cm.setValue(content);
      for (let i = 0; i < cm.lineCount(); ++ i) {
        cm.indentLine(i);
      }
    }
  }
});
