import ace from 'brace';
import React from 'react';
import ReactAce from 'react-ace';
import styles from './styles.less';
import { Subject } from 'rxjs/Subject';
import { expression } from 'viz-app/models/expressions';

const { Range: AceRange } = ace.acequire('ace/range');
const { Anchor: AceAnchor } = ace.acequire('ace/anchor');

import 'brace/theme/chrome';
import 'brace/ext/language_tools';
import './aceExpressionMode';
import './aceExpressionSnippets';

class AceEditor extends ReactAce {
    onChange(event) {
        if (this.props.onChange && !this.silent) {
            this.props.onChange(this.editor, event);
        }
    }
}

export class Editor extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.onLoad = this.onLoad.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onChangeSubject = new Subject();
        this.state = { value: props.value, annotations: [] };
    }
    onLoad(editor) {
        editor.getSession().setUseSoftTabs(true);
        editor.completers.push(new DataframeCompleter(this.props.templates));
    }
    onChange(editor, event) {
        const value = editor.getValue();
        if (value === this.state.value) {
            return;
        }
        this.setState({ value });
        this.onChangeSubject.next({ editor, event, value });
    }
    componentDidMount() {
        this.onChangeSubscription = this.onChangeSubject
            .auditTime(0)
            .distinctUntilChanged()
            .subscribe(({ editor, event, value }) => {

                const { query } = expression(value);

                clearAnnotationsAndMarkers(editor.session);

                if (this.props.onChange) {
                    this.props.onChange(value);
                }

                if (query.error) {
                    const syntaxError = query.error;
                    if (syntaxError) {
                        const row = syntaxError.line && syntaxError.line - 1;
                        let startColumn = syntaxError.column;
                        if (event && event.lines[row].length <= startColumn) {
                            startColumn--;
                        }
                        this.setState({
                            annotations: [
                                new InlineAnnotation(editor.session, {
                                    row: row,
                                    column: startColumn,
                                    endColumn: startColumn + 1,
                                    text: syntaxError.message,
                                    type: 'error'
                                })
                            ]
                        });
                    } else {
                        this.setState({
                            annotations: [
                                new InlineAnnotation(editor.session, {
                                    text: 'Unknown',
                                    type: 'warning'
                                })
                            ]
                        });
                    }
                } else if (this.props.onUpdate) {
                    this.props.onUpdate(value);
                }
            });
    }
    componentWillUnmount() {
        if (this.onChangeSubscription) {
            this.onChangeSubscription.unsubscribe();
            this.onChangeSubscription = undefined;
        }
    }
    componentWillReceiveProps(nextProps) {
        this.setState({ value: nextProps.value });
    }
    render() {
        const { annotations = [] } = this.state;
        const { templates, onChange, readOnly, value, ...props } = this.props;
        return (
            <AceEditor
                theme='chrome'
                mode='graphistry'
                minLines={1}
                maxLines={4}
                focus={true}
                showGutter={false}
                readOnly={readOnly}
                enableSnippets={true}
                annotations={annotations}
                enableLiveAutocompletion={true}
                enableBasicAutocompletion={true}
                setOptions={{
                    wrap: true,
                    useSoftTabs: true,
                    cursorStyle: 'slim',
                    enableSnippets: !readOnly,
                    enableLiveAutocompletion: !readOnly,
                    enableBasicAutocompletion: !readOnly,
                    behavioursEnabled: !readOnly,
                    highlightActiveLine: false,
                    highlightSelectedWord: !readOnly,
                    wrapBehavioursEnabled: true,
                    autoScrollEditorIntoView: !readOnly,
                }}
                editorProps={{
                    $blockScrolling: Infinity,
                    behavioursEnabled: !readOnly,
                    wrapBehavioursEnabled: !readOnly,
                    highlightActiveLine: false,
                    highlightSelectedWord: !readOnly
                }}
                value={this.state.value}
                onLoad={!readOnly && this.onLoad || undefined}
                onChange={!readOnly && this.onChange || undefined}
                {...props}/>
        );
    }
}

/**
 * @param {Object} namespaceMetadata
 * @constructor
 */
class DataframeCompleter {
    constructor(templates = []) {

        this.caseSensitive = false;

        /**
        [{
            name, componentType,
            dataType, identifier
        }....]
         */
        this.templates = Object.keys(templates.reduce((templates, { name, identifier }) => {
            templates[name] = true;
            templates[identifier] = true;
            return templates;
        }, {}));
    }

    /**
     * Ace autocompletion framework API
     * @param {ace.Editor} editor
     * @param {ace.EditSession} session
     * @param {Number} pos
     * @param {String} prefix
     * @param {Function} callback
     */
    getCompletions(editor, session, pos, prefix, callback) {

        const { templates, caseSensitive } = this;

        if (!templates || templates.length === 0 || prefix.length === 0) {
            callback(null, []);
            return;
        }

        if (!caseSensitive) {
            prefix = prefix.toLowerCase();
        }

        const scores = [];

        let index = -1;
        const len = templates.length;

        while (++index < len) {
            const value = templates[index];
            const matchValue = caseSensitive ? value : value.toLowerCase();
            const lastIdx = matchValue.lastIndexOf(prefix, 0);
            if (lastIdx === 0) {
                scores.push({ name: value, value, score: 1, meta: 'identifier' });
            } else if (lastIdx === value.lastIndexOf(':', 0) + 1) {
                scores.push({ name: value, value, score: 0.8, meta: 'identifier' });
            }
        }

        callback(null, scores);
    }
}

class InlineAnnotation {
    constructor(session, info) {
        this.session = session;
        this.info = info;
        this.startAnchor = new AceAnchor(session.getDocument(), info.row, info.column);
        this.endAnchor = new AceAnchor(session.getDocument(), info.row, info.endColumn);
        this.startAnchor.on('change', this.update.bind(this));
        this.endAnchor.on('change', this.update.bind(this));
        this.marker = null;
        this.update();
    }
    update() {
        var anchorRange = AceRange.fromPoints(this.startAnchor.getPosition(), this.endAnchor.getPosition());
        if (this.marker) {
            this.session.removeMarker(this.marker);
        }
        var clazz = this.info.class || styles['marker-highlight-' + this.info.type];
        if (this.info.text) {
            this.marker = this.session.addMarker(anchorRange, clazz, (stringBuilder, range, left, top, config) => {
                var height = config.lineHeight;
                var width = (range.end.column - range.start.column) * config.characterWidth;

                stringBuilder.push(
                    '<div class=\'', clazz, '\' title=', JSON.stringify(this.info.text) , ' style=\'',
                    'height:', height, 'px;',
                    'width:', width, 'px;',
                    'top:', top, 'px;',
                    'left:', left, 'px;', '\'></div>'
                );
            }, true);
        } else {
            this.marker = this.session.addMarker(anchorRange, clazz, this.info.type);
        }
    }
    remove() {
        this.startAnchor.detach();
        this.endAnchor.detach();
        if (this.marker) {
            this.session.removeMarker(this.marker);
        }
    }
}


/**
 * Fiddly way to ensure markers are cleared, because lifecycle management is hard.
 */
function clearAnnotationsAndMarkers(session) {
    session.getAnnotations()
        .forEach((annotation) => annotation.remove());
    session.clearAnnotations();
    const markers = session.getMarkers(true);
    for (const markerId in markers) {
        if (markers.hasOwnProperty(markerId)) {
            session.removeMarker(markerId);
        }
    }
};
