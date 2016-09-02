import ace from 'brace';
import ReactAce from 'react-ace';

import 'brace/theme/chrome';
import 'viz-client/streamGL/graphVizApp/aceExpressionMode';
import 'viz-client/streamGL/graphVizApp/aceExpressionSnippets';

class AceEditor extends ReactAce {
    onChange(event) {
        if (this.props.onChange && !this.silent) {
            const value = this.editor.getValue();
            this.props.onChange(value, event);
        }
    }
}

export function ExpressionEditor({ name, value, onChange, ...props }) {
    return (
        <AceEditor
            mode='graphistry' theme='chrome'
            minLines={1} maxLines={4}
            showGutter={false} enableSnippets={true}
            enableLiveAutocompletion={true}
            enableBasicAutocompletion={true}
            setOptions={{
                wrap: true,
                useSoftTabs: true,
                autoScrollEditorIntoView: true
            }}
            editorProps={{
                $blockScrolling: Infinity,
                behavioursEnabled: true,
                wrapBehavioursEnabled: true,
                highlightActiveLine: false,
                highlightSelectedWord: true,
                autoScrollEditorIntoView: true,
                completers: [new DataframeCompleter([])]
            }}
            ref={(thisRef) => {
                if (!thisRef) { return; }
                const { editor } = thisRef;
                if (!editor) { return; }
                editor.getSession().setUseSoftTabs(true);
            }}
            value={value} name={name}
            onChange={onChange} {...props}
        />
    );
}

/**
 * @param {Object} namespaceMetadata
 * @constructor
 */
class DataframeCompleter {
    constructor(namespaceMetadata) {
        this.setNamespaceMetadata(namespaceMetadata);
        this.caseSensitive = false;
    }

    // insertMatch(editor, data) {
    // }

    setNamespaceMetadata(namespaceMetadata) {
        this.namespaceMetadata = namespaceMetadata;
        const newNamespaceAttributes = {};
        _.each(namespaceMetadata, function (columnsByName, type) {
            _.each(columnsByName, function (column, attributeName) {
                var prefixedAttribute = Identifier.clarifyWithPrefixSegment(attributeName, type);
                newNamespaceAttributes[prefixedAttribute] = column;
                if (newNamespaceAttributes[attributeName] === undefined) {
                    newNamespaceAttributes[attributeName] = column;
                }
                var columnName = column.name;
                if (columnName !== undefined && columnName !== attributeName) {
                    if (newNamespaceAttributes[columnName] === undefined) {
                        newNamespaceAttributes[columnName] = column;
                        newNamespaceAttributes[Identifier.clarifyWithPrefixSegment(columnName, type)] = column;
                    }
                }
            });
        });
        /** @type {Array.<String>} */
        this.namespaceAttributes = _.keys(newNamespaceAttributes);
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
        if (prefix.length === 0 || !this.namespaceAttributes) {
            callback(null, []);
            return;
        }
        if (!this.caseSensitive) {
            prefix = prefix.toLowerCase();
        }
        var scoredAttributes = _.map(this.namespaceAttributes, function (value) {
            var matchValue = this.caseSensitive ? value : value.toLowerCase();
            var lastIdx = matchValue.lastIndexOf(prefix, 0);
            if (lastIdx === 0) {
                return [value, 1];
            } else if (lastIdx === value.lastIndexOf(':', 0) + 1) {
                return [value, 0.8];
            }
            return [value, 0];
        }, this).filter(function (scoreAndValue) {
            return scoreAndValue[1] > 0;
        });
        callback(null, scoredAttributes.map(function (scoreAndValue) {
            return {
                name: scoreAndValue[0],
                value: scoreAndValue[0],
                score: scoreAndValue[1],
                meta: 'identifier'
            };
        }));
    }
}

class InlineAnnotation {
    constructor(session, info) {
        this.session = session;
        this.info = info;
        var Anchor = ace.require('ace/anchor').Anchor;
        this.startAnchor = new Anchor(session.getDocument(), info.row, info.column);
        this.endAnchor = new Anchor(session.getDocument(), info.row, info.endColumn);
        this.startAnchor.on('change', this.update.bind(this));
        this.endAnchor.on('change', this.update.bind(this));
        this.marker = null;
        this.update();
    }
    update() {
        var AceRange = ace.require('ace/range').Range;
        var anchorRange = AceRange.fromPoints(this.startAnchor.getPosition(), this.endAnchor.getPosition());
        if (this.marker) {
            this.session.removeMarker(this.marker);
        }
        var clazz = this.info.class || ('marker-highlight-' + this.info.type);
        if (this.info.text) {
            this.marker = this.session.addMarker(anchorRange, clazz, function(stringBuilder, range, left, top, config) {
                var height = config.lineHeight;
                var width = (range.end.column - range.start.column) * config.characterWidth;

                stringBuilder.push(
                    '<div class=\'', clazz, '\' title=', JSON.stringify(this.info.text) , ' style=\'',
                    'height:', height, 'px;',
                    'width:', width, 'px;',
                    'top:', top, 'px;',
                    'left:', left, 'px;', '\'></div>'
                );
            }.bind(this), true);
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
