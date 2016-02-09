'use strict';
/* globals ace */

var _       = require('underscore');

/**
 * @param {Object} namespaceMetadata
 * @constructor
 */
function DataframeCompleter(namespaceMetadata) {
    this.setNamespaceMetadata(namespaceMetadata);
    this.caseSensitive = false;
}

//DataframeCompleter.prototype.insertMatch = function (editor, data) {
//
//};

DataframeCompleter.prototype.setNamespaceMetadata = function (namespaceMetadata) {
    this.namespaceMetadata = namespaceMetadata;
    var newNamespaceAttributes = {};
    _.each(namespaceMetadata, function (columnsByName, type) {
        _.each(columnsByName, function (column, attributeName) {
            newNamespaceAttributes[type + ':' + attributeName] = column;
            if (newNamespaceAttributes[attributeName] === undefined) {
                newNamespaceAttributes[attributeName] = column;
            }
        });
    });
    /** @type {Array.<String>} */
    this.namespaceAttributes = _.keys(newNamespaceAttributes);
};

/**
 * Ace autocompletion framework API
 * @param {ace.Editor} editor
 * @param {ace.EditSession} session
 * @param {Number} pos
 * @param {String} prefix
 * @param {Function} callback
 */
DataframeCompleter.prototype.getCompletions = function (editor, session, pos, prefix, callback) {
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
};

function InlineAnnotation(session, info) {
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

InlineAnnotation.prototype = {
    update: function() {
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
    },
    remove: function() {
        this.startAnchor.detach();
        this.endAnchor.detach();
        if (this.marker) {
            this.session.removeMarker(this.marker);
        }
    }
};

function ExpressionEditor(targetElement) {
    this.element = targetElement;
    this.editor = ace.edit(targetElement);
    this.editor.setTheme('ace/theme/chrome');
    this.editor.setOptions({
        minLines: 1,
        maxLines: 4,
        wrap: true,
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true,
        autoScrollEditorIntoView: true
    });
    this.editor.setHighlightSelectedWord(true);
    this.editor.setHighlightActiveLine(false);
    this.editor.renderer.setShowGutter(false);
    this.editor.setWrapBehavioursEnabled(true);
    this.editor.setBehavioursEnabled(true);
    // Silences a deprecation warning we don't care about:
    this.editor.$blockScrolling = Infinity;
    this.session = this.editor.getSession();
    this.session.setUseSoftTabs(true);
    this.session.setMode('ace/mode/graphistry');

    this.dataframeCompleter = new DataframeCompleter([]);
    this.editor.completers.push(this.dataframeCompleter);
}

ExpressionEditor.prototype.setReadOnly = function(readOnly) {
    this.editor.setReadOnly(readOnly);
};

/**
 * Fiddly way to ensure markers are cleared, because lifecycle management is hard.
 */
ExpressionEditor.prototype.clearAnnotationsAndMarkers = function () {
    _.each(this.session.getAnnotations(), function (annotation) {
        annotation.remove();
    });
    this.session.clearAnnotations();
    _.each(this.session.getMarkers(true), function (marker, markerID) {
        this.session.removeMarker(markerID);
    }, this);
};

ExpressionEditor.prototype.newInlineAnnotation = function(options) {
    return new InlineAnnotation(this.session, options);
};

module.exports = ExpressionEditor;
