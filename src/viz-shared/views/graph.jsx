export function render(props = {}) {
    const
      { release = {} } = props,
      { current = {} } = release,
      { date: releaseDate = ''  } = current;
    return (
        <div id='app' className="app">
            <div className="content">
                <div className="sim-container" tabindex="-1">
                    <canvas id="simulation" className="sim"> WebGL not supported </canvas>
                    <div id="marquee" className="marquee-outline off"></div>
                    <div id="brush" className="marquee-outline off"></div>
                    { /* over canvas but below interactions */ }
                    <div id="highlighted-point-cont">
                        <div className="highlighted-point">
                            <div className="highlighted-point-center"></div>
                        </div>
                    </div>
                </div>
            </div>
            { /* /content */ }
            <div className='section' id="menus">
                <div className="accordion" id="controlState">
                    <div className="accordion-group">
                        <div className="accordion-heading">
                            <div className="options-group" id="externalLinkButtonContainer">
                                { /* only show if in iframe */ }
                                <a href="#" id="externalLinkButton" className="button nav-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Open in New Tab">
                                    <i className="fa fa-external-link fa-2x"></i>
                                </a>
                                <a href="#" id="fullscreenButton" className="button nav-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Expand to fullscreen">
                                    <i className="fa fa-expand fa-2x"></i>
                                </a>
                            </div>
                            <div title="View Controls" className="options-group">
                                <a href="#" id="zoomin" className="button" data-container="body" data-toggle="tooltip" data-placement="right" title="Zoom in">
                                    <i className="fa fa-search-plus fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="zoomout" className="button" data-container="body" data-toggle="tooltip" data-placement="right" title="Zoom out">
                                    <i className="fa fa-search-minus fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="center" className="button" data-container="body" data-toggle="tooltip" data-placement="right" title="Center View">
                                    <i className="fa fa-compress fa-2x"></i>
                                </a>
                            </div>
                            <div title="Layout Controls" className="options-group">
                                <a href="#" id="mouser" className="button">
                                    <i className="fa fa-arrows fa-2x"></i>
                                </a>
                                <a href="#" id="simulate" className="button modal-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Start/Stop Visual Clustering" data-toggle-group="selections">
                                    <i className="fa fa-play-circle fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="layoutSettingsButton" className="button panel-button" data-container="body" data-toggle="tooltip" data-placement="right" data-toggle-group="popouts" title="Layout Settings">
                                    <i className="fa fa-cogs fa-2x"></i>
                                </a>
                            </div>
                            <div title="Selection Controls" className="options-group">
                                <div className="divide-line"></div>
                                <a href="#" id="viewSelectionButton" className="button modal-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Select Nodes" data-toggle-group="selections">
                                    <span className="fa-stack">
                                        <i className="fa fa-square-o fa-stack-2x" style="font-size: 2em"></i>
                                        <i className="fa fa-arrows fa-stack-1x" style="font-size: 15px"></i>
                                    </span>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="brushButton" className="button modal-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Data Brush" data-toggle-group="selections">
                                    <i className="fa" style="height: 0.9em; width: 0.9em; border-style: dashed; border-width: 0.1em"></i>
                                </a>
                            </div>
                            <div title="Panel Controls" className="options-group">
                                <a href="#" id="histogramPanelControl" className="button panel-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Expand/Shrink Histogram Panel">
                                    <i className="fa fa-bar-chart fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="dataInspectorButton" className="button panel-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Data Inspector">
                                    <i className="fa fa-table fa-2x"></i>
                                </a>
                                <a href="#" id="timeExplorerButton" className="button panel-button beta" data-container="body" data-toggle="tooltip" data-placement="right" title="Time Explorer">
                                    <i className="fa fa-clock-o fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="exclusionButton" className="button panel-button badged" data-container="body" data-toggle="tooltip" data-placement="right" title="Exclude" data-toggle-group="popouts">
                                    <i className="fa fa-ban fa-2x"></i>
                                    <small><span className="badge badge-info"></span></small>
                                </a>
                                <a href="#" id="filterButton" className="button panel-button badged" data-container="body" data-toggle="tooltip" data-placement="right" title="Filter" data-toggle-group="popouts">
                                    <i className="fa fa-filter fa-2x"></i>
                                    <small><span className="badge badge-info"></span></small>
                                </a>
                                <a href="#" id="setsPanelButton" className="button panel-button badged beta" data-container="body" data-toggle="tooltip" data-placement="right" title="Sets" data-toggle-group="popouts">
                                    <i className="fa fa-tag"></i>
                                    <small><span className="badge badge-info"></span></small>
                                </a>
                                { /*
                                <a href="#" id="shortestpath" data-container="body" data-toggle="tooltip" data-placement="right" title="Find routes between two points" style="display:none">
                                    <i className="fa fa-road fa-2x"></i>
                                </a>
                                */ }
                            </div>
                            { /* last options group */ }
                            <div className="options-group">
                                <a href="#" id="forkButton" className="button dialog-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Save A Copy">
                                    <i className="fa fa-code-fork fa-2x"></i>
                                </a>
                                <div className="divide-line"></div>
                                <a href="#" id="persistWorkbookButton" className="beta button dialog-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Save Workbook">
                                    <i className="fa fa-floppy-o fa-2x"></i>
                                </a>
                                <a href="#" id="persistButton" className="button dialog-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Share/Embed Snapshot">
                                    <i className="fa fa-share-alt fa-2x"></i>
                                </a>
                                <a href="#" id="goLiveButton" className="button nav-button" data-container="body" data-toggle="tooltip" data-placement="right" title="Go Live">
                                    <i className="fa fa-share-square fa-2x"></i>
                                </a>
                            </div>
                        </div>
                        { /* accordion heading */ }
                    </div>
                </div>
                <div id="renderingItems" className="settingsPanel">
                    <p className="panelHeader text-center bg-primary">Rendering</p>
                    <div className="form-horizontal">
                        <div className="control-title">Background</div>
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
                        <div id="colorpickers">
                            <div className="form-group colorer">
                                <label  className="control-label col-xs-4">Foreground</label>
                                <div className="col-xs-8">
                                    <div id="foregroundColor">
                                        <div className="colorSelector">
                                            <div style="background-color: #000"></div>
                                        </div>
                                        <div className="colorHolder"></div>
                                    </div>
                                </div>
                            </div>
                            { /* /form-group */ }
                            <div className="form-group colorer">
                                <label  className="control-label col-xs-4">Background</label>
                                <div className="col-xs-8">
                                    <div id="backgroundColor">
                                        <div className="colorSelector">
                                            <div style="background-color: #fff"></div>
                                        </div>
                                        <div className="colorHolder"></div>
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
                <div id="exclusionsPanel" className="exclusionsPanel">
                    <p className="panelHeader text-center bg-primary">Exclusions</p>
                    <div id="exclusions"></div>
                    <div id="addExclusion" className="container-fluid">
                        <div className="row">
                            <div className="col-xs-12">
                                <button type="button" className="btn btn-primary btn-xs addExclusionButton"
                                data-toggle="tooltip" title="New Exclusion">
                                <span className="fa fa-plus"></span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                { /* /exclusionsPanel */ }
                <div id="filtersPanel" className="filtersPanel">
                    <p className="panelHeader text-center bg-primary">Filters</p>
                    <div id="filters"></div>
                    <div id="addFilter"></div>
                </div>
                { /* /filtersPanel */ }
                <div id="setsPanel" className="setsPanel container">
                    <p className="panelHeader text-center bg-primary">Sets</p>
                    <div className="btn-toolbar setsPanelToolbar" role="toolbar" aria-label="sets toolbar"></div>
                    <div id="sets">
                        <p id="setsEmptyMessage" className="text-muted text-center hidden">
                            <i>Sets appear here</i>
                        </p>
                    </div>
                </div>
                { /* /setsPanel */ }
            </div>
            { /* /section */ }
            <div className="status-bar"></div>
            <div id="graph-legend" className="legend-container on">
                <div className="toggles">
                    <a href="#hideLegend"><i className="fa fa-minus-square hider" style="color: rgb(51,51,102)"></i></a>
                    <a href="#revealLegend"><i className="fa fa-plus-square revealer" style="color: rgb(51,51,102)"></i></a>
                </div>
                <div className="legend-title"></div>
                <table>
                    <tr>
                        <td><span className="legend-label">Nodes</span></td>
                        <td><span className="legend-nodes"></span></td>
                    </tr>
                    <tr>
                        <td><span className="legend-label">Edges</span></td>
                        <td><span className="legend-edges"></span></td>
                    </tr>
                </table>
            </div>
            { /* /graph-legend */ }
            <div id="inspector">
                <div className="inspector-panels">
                    <div className="inspector-tabs">
                        <ul className="nav nav-tabs tabs-left sideways">
                            <li className="active"><a href="#inspector-nodes" data-toggle="tab">Nodes</a></li>
                            <li><a href="#inspector-edges" data-toggle="tab">Edges</a></li>
                        </ul>
                    </div>
                    <div className="tab-content">
                        <div id="inspector-nodes" className="tab-pane active">
                            <div className="inspector panel backgrid-container"></div>
                        </div>
                        <div id="inspector-edges" className="tab-pane">
                            <div className="inspector panel backgrid-container"></div>
                        </div>
                    </div>
                </div>
            </div>
            { /* /inspector */ }
            <div id="inspector-overlay" className="panel"></div>
            <div id="histogram" className="panel">
                <div id="histograms"></div>
                <div id="histogramErrors"></div>
                <div id="addHistogram"></div>
            </div>
            { /* /histogram */ }
            <div id="timeExplorer" className="panel">
                <div id="timeExplorerInitDiv"></div>
                <div id="timeExplorerContents" className="hidden">
                    <div id="timeExplorerDragBox" className="dragBox"></div>
                    <div id="timeExplorerEncodingA" className="dragBox"></div>
                    <div id="timeExplorerEncodingB" className="dragBox"></div>
                    <div id="timeExplorerEncodingC" className="dragBox"></div>
                    <div id="timeExplorerVerticalLine" className="verticalLine"></div>
                    <div id="timeExplorerTop">
                        <div className="row" id="timeFilterSliderRow">
                            <div className="col-xs-12 noPadding" id="timeFilterSliderDiv" data-toggle="tooltip" data-placement="top" title="Drag to filter graph by time">
                                <input className="time-panel-filter-slider hidden"
                                       id="time-panel-filter-slider" type="text"
                                       data-slider-id="time-panel-filter-slider"
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="filterhandle" />
                            </div>
                        </div>
                    </div>
                    <div className="row timeExplorerBodyRow timeExplorerFixedHeight">
                        { /* <div id="timeExplorerSideInput" className="col-xs-2 timeExplorerFixedHeight"></div> */ }
                        <div id="timeExplorerVizContainer" className="col-xs-12 timeExplorerFixedHeight noPadding">
                            <div id="timeExplorerBody" className="noPadding"></div>
                            <div id="timeExplorerMain" className="noPadding"></div>
                        </div>
                    </div>
                    <div className="row timeExplorerFixedHeightAxis">
                        <div className="timeExplorerFixedHeightAxis noPadding col-xs-12">
                            <div id="timeExplorerAxisContainer" className="noPadding">
                            </div>
                        </div>
                    </div>
                    <div id="timeExplorerBottom">
                        <div className="row" id="timeEncodingSliderRow">
                            <div className="col-xs-12 noPadding" id="timeEncodingSliderDiv" data-toggle="tooltip" data-placement="top" title="Drag to color graph by time">
                                <input className="time-panel-encoding-slider-a hidden"
                                       id="time-panel-encoding-slider-a" type="text"
                                       data-slider-id="time-panel-encoding-slider-a"
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="encoding-handle-a" />
                                <input className="time-panel-encoding-slider-b hidden"
                                       id="time-panel-encoding-slider-b" type="text"
                                       data-slider-id="time-panel-encoding-slider-b"
                                       data-slider-min="0" data-slider-max="1000"
                                       data-slider-step="1" data-slider-value="[0, 1000]"
                                       data-slider-handle="encoding-handle-b" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            { /* /timeExplorer */ }
            <div className="meter meter-graphnodes" style="left: 21em;">
                <span className="flavor">graph</span>
                <div style="padding: 0; min-width: 95px; height: 30px; line-height: 30px; text-align: right; text-shadow: rgba(0, 0, 0, 0.498039) 1px 1px 0; color: rgb(255, 255, 255); position: absolute; z-index: 10; left: 5px; top: 5px; right: auto; bottom: auto; margin: 0; cursor: pointer;">
                    <div style="position: absolute; top: 0; right: 0; padding: 0 5px; height: 40px; font-size: 24px; font-family: Consolas, 'Andale Mono', monospace; z-index: 2; line-height: 27px; text-align: right">
                        <span id="graph-node-count">0</span>
                    </div>
                    <div style="position: absolute; top: 20px; right: 0; padding: 0 5px; height: 40px; font-size: 24px; font-family: Consolas, 'Andale Mono', monospace; z-index: 2; line-height: 27px; text-align: right">
                        <span id="graph-edge-count">0</span>
                    </div>
                    <div style="position: absolute; top: 15px; left: 0; padding: 0 5px; height: 40px; font-size: 12px; line-height: 15px; font-family: sans-serif; text-align: left; z-index: 2;">nodes<br/>edges</div>
                    <div style="position: relative; height: 40px; z-index: 1; width: 145px;">&nbsp;</div>
                </div>
            </div>
            <div className="logo-container">
                <img src="img/logo_white_horiz.png" />
                <div className="logo-version">{releaseDate}</div>
            </div>
        </div>
    );
}
