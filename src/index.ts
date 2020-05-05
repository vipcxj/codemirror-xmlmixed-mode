/* tslint:disable:no-conditional-assignment ordered-imports */
import CodeMirror, { Editor, Mode, Position, StringStream } from 'codemirror';
import 'codemirror/mode/xml/xml';

declare module 'codemirror' {
    function copyState<T = any>(mode: any, state: T): T;
    function registerGlobalHelper(type: string, name: string, predicate: (mode: Mode<any>, cm: CodeMirror.Editor) => boolean, value: any): void;
}

function getTagRegexp(tagName: string, anchored: boolean): RegExp {
    return new RegExp((anchored ? "^" : "") + "<\/\s*" + tagName + "\s*>", "i");
}

export interface IXmlMixedOptions {
    decideMode?: (tag: ITag) => any;
    xmlOptions?: {
        htmlMode?: boolean;
        autoSelfClosers?: {
            [tag: string]: boolean;
        };
        implicitlyClosed?: {
            [tag: string]: boolean;
        };
        contextGrabbers?: {
            [tag: string]: {
                [key: string]: boolean;
            }
        };
        doNotIndent?: {
            [tag: string]: boolean;
        };
        allowUnquoted?: boolean;
        allowMissing?: boolean;
        allowMissingTagName?: boolean;
        caseFold?: boolean;
        multilineTagIndentFactor?: number;
        multilineTagIndentPastTag?: boolean;
        alignCDATA?: boolean;
    }
}

interface IXmlMixedState {
    token: (steam: StringStream, state: any) => string | null;
    inTag: string | null;
    tag: ITag | null;
    localMode: Mode<any> | null;
    localState: any;
    xmlMode: Mode<any>;
    xmlState: any;
    cdata: boolean;
    cdataEaten: boolean;
}

interface ITag {
    name: string;
    attributes: {
        [property: string]: string;
    }
    mode?: Mode<any>;
}

const REG_IN_TAG = /^([\S]+) (.*)/;
const REG_TAG = /\btag\b/;
const REG_ATTR = /\s+(\S+)\s*=\s*('([^']*)'|"([^"]*)")/g;

function createTag(text: string): ITag | null {
    const [, name, content] = REG_IN_TAG.exec(text) || [];
    if (!name) {
        return null;
    }
    const attributes: ITag['attributes'] = {};
    let parts;
    while ((parts = REG_ATTR.exec(content)) !== null) {
        attributes[parts[1]] = parts[3] || parts[4];
    }
    return {
        name,
        attributes,
    }
}

export function defaultDecideMode(ignored: ITag): any {
    return null;
}

interface ISuperMode<T=any> extends Omit<Mode<T>, 'indent'> {
    indent: (state: T, textAfter: string, line?: string) => typeof CodeMirror.Pass | number;
}

const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';

CodeMirror.defineMode("xmlmixed", (config, parserConfig: IXmlMixedOptions = {}): Mode<IXmlMixedState> => {
    const xmlMode:ISuperMode = CodeMirror.getMode<any>(config, {
        name: "xml",
        ...parserConfig.xmlOptions,
    }) as ISuperMode;

    const decideMode = parserConfig.decideMode || defaultDecideMode;

    function xml(stream: StringStream, state: IXmlMixedState) {
        const style = state.xmlMode.token!(stream, state.xmlState);
        const tag = style && REG_TAG.test(style);
        const tagName: string | undefined | null = state.xmlState.tagName;
        if (tag && !/[<>\s\/]/.test(stream.current()) && tagName) { // 标签的开头
            state.inTag = tagName + " "
        } else if (state.inTag && tag && />$/.test(stream.current())) { // 标签的结束
            const tagObj = createTag(state.inTag);
            if (tagObj) {
                const mode = decideMode(tagObj);
                const modeObj = mode && CodeMirror.getMode(config, mode);
                if (modeObj) {
                    tagObj.mode = modeObj;
                    state.tag = tagObj;
                    state.token = xmlMixed;
                    state.localMode = modeObj;
                    state.localState = CodeMirror.startState(modeObj, xmlMode.indent(state.xmlState, "", ""));
                }
            }
            state.inTag = null;
        } else if (state.inTag) { // 标签的中间
            state.inTag += stream.current();
            if (stream.eol()) state.inTag += " "
        }
        return style;
    }

    function xmlMixed(stream: StringStream, state: IXmlMixedState) {
        state.cdataEaten = false;
        if (state.cdata && stream.match(CDATA_CLOSE, true)) {
            state.cdata = false;
            state.cdataEaten = true;
            return 'cdata close';
        }
        if (!state.cdata) {
            if (stream.match(CDATA_OPEN, true)) {
                state.cdata = true;
                state.cdataEaten = true;
                return 'cdata open';
            }
            if (stream.match(getTagRegexp(state.tag?.name!, true), false)) {
                state.tag = null;
                state.token = xml;
                state.localMode = state.localState = null;
                return null;
            }
        }
        const idxCdOpen = state.cdata ? -1 : stream.string.indexOf(CDATA_OPEN, stream.start);
        const idxCdClose = state.cdata ? stream.string.indexOf(CDATA_CLOSE, stream.start) : -1;
        let idxExit = state.cdata ? -1 : stream.string.search(getTagRegexp(state.tag?.name!, false));
        if (idxExit < stream.start) {
            idxExit = -1;
        }
        const style = state.localMode!.token!(stream, state.localState);
        let backUp = false;
        if (idxCdOpen !== -1 && stream.pos > idxCdOpen) {
            stream.backUp(stream.pos - idxCdOpen);
            backUp = true;
        }
        if (idxCdClose !== -1 && stream.pos > idxCdClose) {
            stream.backUp(stream.pos - idxCdClose);
            backUp = true;
        }
        if (idxExit !== -1 && stream.pos > idxExit) {
            stream.backUp(stream.pos - idxExit);
            backUp = true;
        }
        if (backUp && stream.start === stream.pos) {
            return null;
        }
        return style;
    }

    // noinspection JSUnusedGlobalSymbols
    const theMode = {
        startState (): IXmlMixedState {
            const state = CodeMirror.startState(xmlMode as Mode<any>);
            return {
                token: xml,
                inTag: null,
                tag: null,
                localMode: null,
                localState: null,
                xmlMode: xmlMode as Mode<any>,
                xmlState: state,
                cdata: false,
                cdataEaten: false,
            };
        },

        copyState (state): IXmlMixedState {
            let local = null;
            if (state.localState && state.localMode) {
                local = CodeMirror.copyState(state.localMode, state.localState);
            }
            let xmlState = null;
            if (state.xmlState) {
                xmlState = CodeMirror.copyState(xmlMode, state.xmlState);
            }
            return {
                token: state.token,
                inTag: state.inTag,
                tag: state.tag,
                localMode: state.localMode,
                localState: local,
                xmlMode: state.xmlMode,
                xmlState,
                cdata: state.cdata,
                cdataEaten: state.cdataEaten,
            };
        },

        token (stream: StringStream, state: IXmlMixedState): string | null {
            return state.token(stream, state);
        },

        indent (state: IXmlMixedState, textAfter: string, line?: string) {
            if (!state.localMode || /^\s*<\//.test(textAfter)) {
                return xmlMode.indent(state.xmlState, textAfter, line);
            }
            else if (state.localMode.indent) {
                return (state.localMode as ISuperMode).indent(state.localState, textAfter, line);
            }
            else {
                return CodeMirror.Pass;
            }
        },

        innerMode (state: IXmlMixedState) {
            if (state.tag && state.cdataEaten) {
                return {
                    state,
                    mode: theMode,
                };
            }
            return {
                state: state.localState || state.xmlState,
                mode: state.localMode || xmlMode,
            };
        },

        closeBrackets: {
            pairs: '',
        },
    } as Mode<IXmlMixedState>;
    return theMode;
});

interface Range {
    from: Position;
    to: Position;
}

CodeMirror.registerGlobalHelper(
    'fold',
    'cdata',
    () => true,
    (cm: Editor, start: Position): Range | undefined => {
    const { ch, line } = start;
    let text = cm.getLine(line);
    const idx = text.indexOf('<![CDATA[', ch);
    if (idx > -1) {
        const type = cm.getTokenTypeAt(CodeMirror.Pos(line, idx + 1));
        if (type && type.indexOf('cdata open') !== -1) {
            const from = CodeMirror.Pos(line, idx + 9);
            let end = text.indexOf(']]>', idx + 9);
            if (end > -1) {
                return {
                    from,
                    to: CodeMirror.Pos(line, end),
                };
            } else {
                for (let l = line + 1; l <= cm.lastLine(); ++l) {
                    text = cm.getLine(l);
                    end = text.indexOf(']]>');
                    if (end > -1) {
                        return {
                            from,
                            to: CodeMirror.Pos(l, end),
                        }
                    }
                }
            }
        }
    }
    return undefined;
});
