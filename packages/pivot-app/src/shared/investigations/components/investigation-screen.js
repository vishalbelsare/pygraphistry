import _ from "underscore";
import SplitPane from "react-split-pane";
import styles from "./investigation-screen.less";
import { Investigation } from "pivot-shared/investigations";

import { Graphistry } from "@graphistry/client-api-react";
import { uiTweaks } from "../../services/layouts.js";
import iframeStyle from "./iframe-style.less";

export default function InvestigationScreen({
  templates = [],
  investigations = [],
  activeInvestigation = {},
  copyInvestigation,
  selectInvestigation,
  createInvestigation,
  user
}) {
  const { tags: activeTags = [] } = activeInvestigation || {};
  const demoSingletons = [
    "Demo",
    "Blazegraph",
    "PAN",
    "Graphviz",
    "HealthDemo"
  ];
  const relevantTemplates =
    activeTags.length > 0
      ? templates.filter(
          ({ tags: templateTags = [] }) =>
            _.intersection(templateTags, activeTags).length > 0
        )
      : //Hide demo pivots for *
        templates.filter(
          ({ tags: templateTags = [] }) =>
            !(
              templateTags.length === 1 &&
              demoSingletons.indexOf(templateTags[0]) > -1
            )
        );

  let showLoadingIndicator = true;
  const { graphistryHost = `` } = user;
  let loadingMessage = `Loading Visualization`;
  const { status: uploadStatus } = activeInvestigation;
  const { axes, controls } = activeInvestigation;
  let { datasetName, datasetType } = activeInvestigation;

  const eventTable = activeInvestigation.eventTable || null;
  const table = eventTable ? eventTable.table : null;
  const eventTableExistsButIsEmpty = table && table.length === 0;

  if (eventTableExistsButIsEmpty) {
    showLoadingIndicator = false;
    datasetName = datasetType = ``;
    loadingMessage = `Your current investigation settings didn't surface any events. Try adjusting dates or pivots.`;
  } else if (uploadStatus && (uploadStatus.searching || uploadStatus.etling)) {
    datasetName = datasetType = ``;
    loadingMessage = uploadStatus.searching
      ? `Running Pivots`
      : `Uploading Results`;
  } else if (!datasetName || !datasetType) {
    showLoadingIndicator = false;
    loadingMessage = `Run a Pivot to get started`;
  }

  return (
    <div className={styles["investigation-all"]}>
      <div className={styles["investigation-split"]}>
        <SplitPane split="vertical" minSize={300} defaultSize={300}>
          <Investigation
            key={`investigation:${activeInvestigation.id}`}
            user={user}
            data={activeInvestigation}
            templates={relevantTemplates}
            investigations={investigations}
            copyInvestigation={copyInvestigation}
            selectInvestigation={selectInvestigation}
            createInvestigation={createInvestigation}
          />
          <Graphistry
            key={`investigation:${activeInvestigation.id}:${datasetName ||
              "viz"}`}
            className={iframeStyle.iframe}
            vizClassName={iframeStyle.iframe}
            {...uiTweaks[activeInvestigation.layout] || {}}
            showLogo={false}
            showIcons={true}
            showToolbar={true}
            backgroundColor="#eeeeee"
            axes={axes}
            controls={controls}
            type={datasetType}
            dataset={datasetName}
            graphistryHost={graphistryHost || ""}
            loadingMessage={loadingMessage}
            showLoadingIndicator={showLoadingIndicator}
            edgeOpacity={activeInvestigation.edgeOpacity}
          />
        </SplitPane>
      </div>
    </div>
  );
}
