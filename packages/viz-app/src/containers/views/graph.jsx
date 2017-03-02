import styles from './graph.less';
// const styles = {};

export function render(props = {}, workbooksVDom) {
    const
      { release = {} } = props,
      { current = {} } = release,
      { date: releaseDate = "\u00a0" } = current;   // "\u00a0" is Unicode version of HTML '&nbsp;'
    return (
        <div id={styles["app"] || "app"} class_={{ [styles["app"] || "app"]: true }}>
            <div class_={{ [styles["content"] || "content"]: true }}>{[
                workbooksVDom
            ]}</div>
            { /* /content */ }
            <div class_={{ [styles["section"] || "section"]: true }} id={styles["menus"] || "menus"}>
                <div class_={{ [styles["accordion"] || "accordion"]: true }} id={styles["controlState"] || "controlState"}>
                    <div class_={{ [styles["accordion-group"] || "accordion-group"]: true }}>
                        <div class_={{ [styles["accordion-heading"] || "accordion-heading"]: true }}>
                            <div class_={{ [styles["options-group"] || "options-group"]: true }} id={styles["externalLinkButtonContainer"] || "externalLinkButtonContainer"}>
                                { /* only show if in iframe */ }
                                <a href="#" id={styles["externalLinkButton"] || "externalLinkButton"} class_={{ [styles["button"] || "button"]: true, [styles["nav-button"] || "nav-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Open in New Tab">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-external-link"] || "fa-external-link"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <a href="#" id={styles["fullscreenButton"] || "fullscreenButton"} class_={{ [styles["button"] || "button"]: true, [styles["nav-button"] || "nav-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Expand to fullscreen">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-expand"] || "fa-expand"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                            </div>
                            <div title="View Controls" class_={{ [styles["options-group"] || "options-group"]: true }}>
                                <a href="#" id={styles["zoomin"] || "zoomin"} class_={{ [styles["button"] || "button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Zoom in">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-search-plus"] || "fa-search-plus"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["zoomout"] || "zoomout"} class_={{ [styles["button"] || "button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Zoom out">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-search-minus"] || "fa-search-minus"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["center"] || "center"} class_={{ [styles["button"] || "button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Center View">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-compress"] || "fa-compress"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                            </div>
                            <div title="Layout Controls" class_={{ [styles["options-group"] || "options-group"]: true }}>
                                <a href="#" id={styles["mouser"] || "mouser"} class_={{ [styles["button"] || "button"]: true }}>
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-arrows"] || "fa-arrows"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <a href="#" id={styles["simulate"] || "simulate"} class_={{ [styles["button"] || "button"]: true, [styles["modal-button"] || "modal-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Start/Stop Visual Clustering" data-toggle-group="selections">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-play-circle"] || "fa-play-circle"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["layoutSettingsButton"] || "layoutSettingsButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" data-toggle-group="popouts" title="Layout Settings">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-cogs"] || "fa-cogs"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                            </div>
                            <div title="Selection Controls" class_={{ [styles["options-group"] || "options-group"]: true }}>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["viewSelectionButton"] || "viewSelectionButton"} class_={{ [styles["button"] || "button"]: true, [styles["modal-button"] || "modal-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Select Nodes" data-toggle-group="selections">
                                    <span class_={{ [styles["fa-stack"] || "fa-stack"]: true }}>
                                        <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-square-o"] || "fa-square-o"]: true, [styles["fa-stack-2x"] || "fa-stack-2x"]: true }} style="font-size: 2em"></i>
                                        <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-arrows"] || "fa-arrows"]: true, [styles["fa-stack-1x"] || "fa-stack-1x"]: true }} style="font-size: 15px"></i>
                                    </span>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["brushButton"] || "brushButton"} class_={{ [styles["button"] || "button"]: true, [styles["modal-button"] || "modal-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Data Brush" data-toggle-group="selections">
                                    <i class_={{ [styles["fa"] || "fa"]: true }} style="height: 0.9em; width: 0.9em; border-style: dashed; border-width: 0.1em"></i>
                                </a>
                            </div>
                            <div title="Panel Controls" class_={{ [styles["options-group"] || "options-group"]: true }}>
                                <a href="#" id={styles["histogramPanelControl"] || "histogramPanelControl"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Expand/Shrink Histogram Panel">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-bar-chart"] || "fa-bar-chart"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["dataInspectorButton"] || "dataInspectorButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Data Inspector">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-table"] || "fa-table"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <a href="#" id={styles["timeExplorerButton"] || "timeExplorerButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true, [styles["beta"] || "beta"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Time Explorer">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-clock-o"] || "fa-clock-o"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["exclusionButton"] || "exclusionButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true, [styles["badged"] || "badged"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Exclude" data-toggle-group="popouts">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-ban"] || "fa-ban"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                    <small><span class_={{ [styles["badge"] || "badge"]: true, [styles["badge-info"] || "badge-info"]: true }}></span></small>
                                </a>
                                <a href="#" id={styles["filterButton"] || "filterButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true, [styles["badged"] || "badged"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Filter" data-toggle-group="popouts">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-filter"] || "fa-filter"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                    <small><span class_={{ [styles["badge"] || "badge"]: true, [styles["badge-info"] || "badge-info"]: true }}></span></small>
                                </a>
                                <a href="#" id={styles["setsPanelButton"] || "setsPanelButton"} class_={{ [styles["button"] || "button"]: true, [styles["panel-button"] || "panel-button"]: true, [styles["badged"] || "badged"]: true, [styles["beta"] || "beta"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Sets" data-toggle-group="popouts">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-tag"] || "fa-tag"]: true }}></i>
                                    <small><span class_={{ [styles["badge"] || "badge"]: true, [styles["badge-info"] || "badge-info"]: true }}></span></small>
                                </a>
                                { /*
                                <a href="#" id={styles["shortestpath"] || "shortestpath"} data-container="body" data-toggle="tooltip" data-placement="right" title="Find routes between two points" style="display:none">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-road"] || "fa-road"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                */ }
                            </div>
                            { /* last options group */ }
                            <div class_={{ [styles["options-group"] || "options-group"]: true }}>
                                <a href="#" id={styles["forkButton"] || "forkButton"} class_={{ [styles["button"] || "button"]: true, [styles["dialog-button"] || "dialog-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Save A Copy">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-code-fork"] || "fa-code-fork"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <div class_={{ [styles["divide-line"] || "divide-line"]: true }}></div>
                                <a href="#" id={styles["persistWorkbookButton"] || "persistWorkbookButton"} class_={{ [styles["beta"] || "beta"]: true, [styles["button"] || "button"]: true, [styles["dialog-button"] || "dialog-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Save Workbook">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-floppy-o"] || "fa-floppy-o"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <a href="#" id={styles["persistButton"] || "persistButton"} class_={{ [styles["button"] || "button"]: true, [styles["dialog-button"] || "dialog-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Share/Embed Snapshot">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-share-alt"] || "fa-share-alt"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                                <a href="#" id={styles["goLiveButton"] || "goLiveButton"} class_={{ [styles["button"] || "button"]: true, [styles["nav-button"] || "nav-button"]: true }} data-container="body" data-toggle="tooltip" data-placement="right" title="Go Live">
                                    <i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-share-square"] || "fa-share-square"]: true, [styles["fa-2x"] || "fa-2x"]: true }}></i>
                                </a>
                            </div>
                        </div>
                        { /* accordion heading */ }
                    </div>
                </div>
                <div id={styles["renderingItems"] || "renderingItems"} class_={{ [styles["settingsPanel"] || "settingsPanel"]: true }}>
                    <p class_={{ [styles["panelHeader"] || "panelHeader"]: true, [styles["text-center"] || "text-center"]: true, [styles["bg-primary"] || "bg-primary"]: true }}>Rendering</p>
                    <div class_={{ [styles["form-horizontal"] || "form-horizontal"]: true }}>
                        <div class_={{ [styles["control-title"] || "control-title"]: true }}>Background</div>
                        <style scoped="scoped">{[`
                            .colorpicker {
                                right: 7em;
                            }
                            .colorSelector {
                                position: relative;
                                top: 0;
                                left: 0;
                                width: 36px;
                                height: 36px;
                                background: url(libs/images/select2.png);
                            }
                            .colorSelector div {
                                position: relative;
                                top: 4px;
                                left: 4px;
                                width: 28px;
                                height: 28px;
                                background: url(libs/images/select2.png) center;
                            }
                        `]}</style>
                        <div id={styles["colorpickers"] || "colorpickers"}>
                            <div class_={{ [styles["form-group"] || "form-group"]: true, [styles["colorer"] || "colorer"]: true }}>
                                <label  class_={{ [styles["control-label"] || "control-label"]: true, [styles["col-xs-4"] || "col-xs-4"]: true }}>Foreground</label>
                                <div class_={{ [styles["col-xs-8"] || "col-xs-8"]: true }}>
                                    <div id={styles["foregroundColor"] || "foregroundColor"}>
                                        <div class_={{ [styles["colorSelector"] || "colorSelector"]: true }}>
                                            <div style="background-color: #000"></div>
                                        </div>
                                        <div class_={{ [styles["colorHolder"] || "colorHolder"]: true }}></div>
                                    </div>
                                </div>
                            </div>
                            { /* /form-group */ }
                            <div class_={{ [styles["form-group"] || "form-group"]: true, [styles["colorer"] || "colorer"]: true }}>
                                <label  class_={{ [styles["control-label"] || "control-label"]: true, [styles["col-xs-4"] || "col-xs-4"]: true }}>Background</label>
                                <div class_={{ [styles["col-xs-8"] || "col-xs-8"]: true }}>
                                    <div id={styles["backgroundColor"] || "backgroundColor"}>
                                        <div class_={{ [styles["colorSelector"] || "colorSelector"]: true }}>
                                            <div style="background-color: #fff"></div>
                                        </div>
                                        <div class_={{ [styles["colorHolder"] || "colorHolder"]: true }}></div>
                                    </div>
                                </div>
                            </div>
                            { /* /form-group */ }
                        </div>
                        { /* /colorpickers */ }
                    </div>
                    { /* /form-horizontal */ }
                </div>
                { /* /renderingItems */ }
                <div id={styles["exclusionsPanel"] || "exclusionsPanel"} class_={{ [styles["exclusionsPanel"] || "exclusionsPanel"]: true }}>
                    <p class_={{ [styles["panelHeader"] || "panelHeader"]: true, [styles["text-center"] || "text-center"]: true, [styles["bg-primary"] || "bg-primary"]: true }}>Exclusions</p>
                    <div id={styles["exclusions"] || "exclusions"}></div>
                    <div id={styles["addExclusion"] || "addExclusion"} class_={{ [styles["container-fluid"] || "container-fluid"]: true }}>
                        <div class_={{ [styles["row"] || "row"]: true }}>
                            <div class_={{ [styles["col-xs-12"] || "col-xs-12"]: true }}>
                                <button type="button" class_={{ [styles["btn"] || "btn"]: true, [styles["btn-primary"] || "btn-primary"]: true, [styles["btn-xs"] || "btn-xs"]: true, [styles["addExclusionButton"] || "addExclusionButton"]: true }}
                                data-toggle="tooltip" title="New Exclusion">
                                <span class_={{ [styles["fa"] || "fa"]: true, [styles["fa-plus"] || "fa-plus"]: true }}></span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                { /* /exclusionsPanel */ }
                <div id={styles["filtersPanel"] || "filtersPanel"} class_={{ [styles["filtersPanel"] || "filtersPanel"]: true }}>
                    <p class_={{ [styles["panelHeader"] || "panelHeader"]: true, [styles["text-center"] || "text-center"]: true, [styles["bg-primary"] || "bg-primary"]: true }}>Filters</p>
                    <div id={styles["filters"] || "filters"}></div>
                    <div id={styles["addFilter"] || "addFilter"}></div>
                </div>
                { /* /filtersPanel */ }
                <div id={styles["setsPanel"] || "setsPanel"} class_={{ [styles["setsPanel"] || "setsPanel"]: true, [styles["container"] || "container"]: true }}>
                    <p class_={{ [styles["panelHeader"] || "panelHeader"]: true, [styles["text-center"] || "text-center"]: true, [styles["bg-primary"] || "bg-primary"]: true }}>Sets</p>
                    <div class_={{ [styles["btn-toolbar"] || "btn-toolbar"]: true, [styles["setsPanelToolbar"] || "setsPanelToolbar"]: true }} role="toolbar" aria-label="sets toolbar"></div>
                    <div id={styles["sets"] || "sets"}>
                        <p id={styles["setsEmptyMessage"] || "setsEmptyMessage"} class_={{ [styles["text-muted"] || "text-muted"]: true, [styles["text-center"] || "text-center"]: true, [styles["hidden"] || "hidden"]: true }}>
                            <i>Sets appear here</i>
                        </p>
                    </div>
                </div>
                { /* /setsPanel */ }
            </div>
            { /* /section */ }
            <div class_={{ [styles["status-bar"] || "status-bar"]: true }}></div>
            <div id={styles["graph-legend"] || "graph-legend"} class_={{ [styles["legend-container"] || "legend-container"]: true, [styles["on"] || "on"]: true }}>
                <div class_={{ [styles["toggles"] || "toggles"]: true }}>
                    <a href="#hideLegend"><i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-minus-square"] || "fa-minus-square"]: true, [styles["hider"] || "hider"]: true }} style="color: rgb(51,51,102)"></i></a>
                    <a href="#revealLegend"><i class_={{ [styles["fa"] || "fa"]: true, [styles["fa-plus-square"] || "fa-plus-square"]: true, [styles["revealer"] || "revealer"]: true }} style="color: rgb(51,51,102)"></i></a>
                </div>
                <div class_={{ [styles["legend-title"] || "legend-title"]: true }}></div>
                <table>
                    <tr>
                        <td><span class_={{ [styles["legend-label"] || "legend-label"]: true }}>Nodes</span></td>
                        <td><span class_={{ [styles["legend-nodes"] || "legend-nodes"]: true }}></span></td>
                    </tr>
                    <tr>
                        <td><span class_={{ [styles["legend-label"] || "legend-label"]: true }}>Edges</span></td>
                        <td><span class_={{ [styles["legend-edges"] || "legend-edges"]: true }}></span></td>
                    </tr>
                </table>
            </div>
            { /* /graph-legend */ }
            <div id={styles["inspector"] || "inspector"}>
                <div class_={{ [styles["inspector-panels"] || "inspector-panels"]: true }}>
                    <div class_={{ [styles["inspector-tabs"] || "inspector-tabs"]: true }}>
                        <ul class_={{ [styles["nav"] || "nav"]: true, [styles["nav-tabs"] || "nav-tabs"]: true, [styles["tabs-left"] || "tabs-left"]: true, [styles["sideways"] || "sideways"]: true }}>
                            <li class_={{ [styles["active"] || "active"]: true }}><a href="#inspector-nodes" data-toggle="tab">Nodes</a></li>
                            <li><a href="#inspector-edges" data-toggle="tab">Edges</a></li>
                        </ul>
                    </div>
                    <div class_={{ [styles["tab-content"] || "tab-content"]: true }}>
                        <div id={styles["inspector-nodes"] || "inspector-nodes"} class_={{ [styles["tab-pane"] || "tab-pane"]: true, [styles["active"] || "active"]: true }}>
                            <div class_={{ [styles["inspector"] || "inspector"]: true, [styles["panel"] || "panel"]: true, [styles["backgrid-container"] || "backgrid-container"]: true }}></div>
                        </div>
                        <div id={styles["inspector-edges"] || "inspector-edges"} class_={{ [styles["tab-pane"] || "tab-pane"]: true }}>
                            <div class_={{ [styles["inspector"] || "inspector"]: true, [styles["panel"] || "panel"]: true, [styles["backgrid-container"] || "backgrid-container"]: true }}></div>
                        </div>
                    </div>
                </div>
            </div>
            { /* /inspector */ }
            <div id={styles["inspector-overlay"] || "inspector-overlay"} class_={{ [styles["panel"] || "panel"]: true }}></div>
            <div id={styles["histogram"] || "histogram"} class_={{ [styles["panel"] || "panel"]: true }}>
                <div id={styles["histograms"] || "histograms"}></div>
                <div id={styles["histogramErrors"] || "histogramErrors"}></div>
                <div id={styles["addHistogram"] || "addHistogram"}></div>
            </div>
            { /* /histogram */ }
            <div id={styles["timeExplorer"] || "timeExplorer"} class_={{ [styles["panel"] || "panel"]: true }}>
                <div id={styles["timeExplorerInitDiv"] || "timeExplorerInitDiv"}></div>
                <div id={styles["timeExplorerContents"] || "timeExplorerContents"} class_={{ [styles["hidden"] || "hidden"]: true }}>
                    <div id={styles["timeExplorerDragBox"] || "timeExplorerDragBox"} class_={{ [styles["dragBox"] || "dragBox"]: true }}></div>
                    <div id={styles["timeExplorerEncodingA"] || "timeExplorerEncodingA"} class_={{ [styles["dragBox"] || "dragBox"]: true }}></div>
                    <div id={styles["timeExplorerEncodingB"] || "timeExplorerEncodingB"} class_={{ [styles["dragBox"] || "dragBox"]: true }}></div>
                    <div id={styles["timeExplorerEncodingC"] || "timeExplorerEncodingC"} class_={{ [styles["dragBox"] || "dragBox"]: true }}></div>
                    <div id={styles["timeExplorerVerticalLine"] || "timeExplorerVerticalLine"} class_={{ [styles["verticalLine"] || "verticalLine"]: true }}></div>
                    <div id={styles["timeExplorerTop"] || "timeExplorerTop"}>
                        <div class_={{ [styles["row"] || "row"]: true }} id={styles["timeFilterSliderRow"] || "timeFilterSliderRow"}>
                            <div class_={{ [styles["col-xs-12"] || "col-xs-12"]: true, [styles["noPadding"] || "noPadding"]: true }} id={styles["timeFilterSliderDiv"] || "timeFilterSliderDiv"} data-toggle="tooltip" data-placement="top" title="Drag to filter graph by time">
                                <input class_={{ [styles["time-panel-filter-slider"] || "time-panel-filter-slider"]: true, [styles["hidden"] || "hidden"]: true }}
                                       id={styles["time-panel-filter-slider"] || "time-panel-filter-slider"} type="text"
                                       data-slider-id={styles["time-panel-filter-slider"] || "time-panel-filter-slider"}
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="filterhandle" />
                            </div>
                        </div>
                    </div>
                    <div class_={{ [styles["row"] || "row"]: true, [styles["timeExplorerBodyRow"] || "timeExplorerBodyRow"]: true, [styles["timeExplorerFixedHeight"] || "timeExplorerFixedHeight"]: true }}>
                        { /* <div id={styles["timeExplorerSideInput"] || "timeExplorerSideInput"} class_={{ [styles["col-xs-2"] || "col-xs-2"]: true, [styles["timeExplorerFixedHeight"] || "timeExplorerFixedHeight"]: true }}></div> */ }
                        <div id={styles["timeExplorerVizContainer"] || "timeExplorerVizContainer"} class_={{ [styles["col-xs-12"] || "col-xs-12"]: true, [styles["timeExplorerFixedHeight"] || "timeExplorerFixedHeight"]: true, [styles["noPadding"] || "noPadding"]: true }}>
                            <div id={styles["timeExplorerBody"] || "timeExplorerBody"} class_={{ [styles["noPadding"] || "noPadding"]: true }}></div>
                            <div id={styles["timeExplorerMain"] || "timeExplorerMain"} class_={{ [styles["noPadding"] || "noPadding"]: true }}></div>
                        </div>
                    </div>
                    <div class_={{ [styles["row"] || "row"]: true, [styles["timeExplorerFixedHeightAxis"] || "timeExplorerFixedHeightAxis"]: true }}>
                        <div class_={{ [styles["timeExplorerFixedHeightAxis"] || "timeExplorerFixedHeightAxis"]: true, [styles["noPadding"] || "noPadding"]: true, [styles["col-xs-12"] || "col-xs-12"]: true }}>
                            <div id={styles["timeExplorerAxisContainer"] || "timeExplorerAxisContainer"} class_={{ [styles["noPadding"] || "noPadding"]: true }}>
                            </div>
                        </div>
                    </div>
                    <div id={styles["timeExplorerBottom"] || "timeExplorerBottom"}>
                        <div class_={{ [styles["row"] || "row"]: true }} id={styles["timeEncodingSliderRow"] || "timeEncodingSliderRow"}>
                            <div class_={{ [styles["col-xs-12"] || "col-xs-12"]: true, [styles["noPadding"] || "noPadding"]: true }} id={styles["timeEncodingSliderDiv"] || "timeEncodingSliderDiv"} data-toggle="tooltip" data-placement="top" title="Drag to color graph by time">
                                <input class_={{ [styles["time-panel-encoding-slider-a"] || "time-panel-encoding-slider-a"]: true, [styles["hidden"] || "hidden"]: true }}
                                       id={styles["time-panel-encoding-slider-a"] || "time-panel-encoding-slider-a"} type="text"
                                       data-slider-id={styles["time-panel-encoding-slider-a"] || "time-panel-encoding-slider-a"}
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="encoding-handle-a" />
                                <input class_={{ [styles["time-panel-encoding-slider-b"] || "time-panel-encoding-slider-b"]: true, [styles["hidden"] || "hidden"]: true }}
                                       id={styles["time-panel-encoding-slider-b"] || "time-panel-encoding-slider-b"} type="text"
                                       data-slider-id={styles["time-panel-encoding-slider-b"] || "time-panel-encoding-slider-b"}
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="encoding-handle-b" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            { /* /timeExplorer */ }
            <div class_={{ [styles["meter"] || "meter"]: true, [styles["meter-graphnodes"] || "meter-graphnodes"]: true }} style="left: 21em;">
                <span class_={{ [styles["flavor"] || "flavor"]: true }}>graph</span>
                <div style="padding: 0; min-width: 95px; height: 30px; line-height: 30px; text-align: right; text-shadow: rgba(0, 0, 0, 0.498039) 1px 1px 0; color: rgb(255, 255, 255); position: absolute; z-index: 10; left: 5px; top: 5px; right: auto; bottom: auto; margin: 0; cursor: pointer;">
                    <div style="position: absolute; top: 0; right: 0; padding: 0 5px; height: 40px; font-size: 24px; font-family: Consolas, 'Andale Mono', monospace; z-index: 2; line-height: 27px; text-align: right">
                        <span id={styles["graph-node-count"] || "graph-node-count"}>0</span>
                    </div>
                    <div style="position: absolute; top: 20px; right: 0; padding: 0 5px; height: 40px; font-size: 24px; font-family: Consolas, 'Andale Mono', monospace; z-index: 2; line-height: 27px; text-align: right">
                        <span id={styles["graph-edge-count"] || "graph-edge-count"}>0</span>
                    </div>
                    <div style="position: absolute; top: 15px; left: 0; padding: 0 5px; height: 40px; font-size: 12px; line-height: 15px; font-family: sans-serif; text-align: left; z-index: 2;">nodes<br/>edges</div>
                    <div style="position: relative; height: 40px; z-index: 1; width: 145px;">&nbsp;</div>
                </div>
            </div>
            <div class_={{ [styles["app-branding"] || "app-branding"]: true }}><span class_={{ [styles["version"] || "version"]: true }}>{releaseDate}</span></div>
        </div>
    );
}
