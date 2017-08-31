import _ from 'underscore';
import SplitPane from 'react-split-pane';
import styles from './investigation-screen.less';
import { Investigation } from 'pivot-shared/investigations';

import { Graphistry } from '@graphistry/client-api-react';
import { uiTweaks } from '../../services/layouts.js';
import iframeStyle from './visualization-styles.less';

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
    const relevantTemplates =
        activeTags.length > 0 ?
            templates.filter(({ tags: templateTags = [] }) =>
                _.intersection(templateTags, activeTags).length > 0
            ) :
            templates;

    let showLoadingIndicator = true;
    let { graphistryHost = `` } = user;
    let loadingMessage = `Loading Visualization`;
    let { status: uploadStatus } = activeInvestigation;
    let { axes, controls, datasetName, datasetType } = activeInvestigation;

    if (uploadStatus && (uploadStatus.searching || uploadStatus.etling)) {
        datasetName = datasetType = ``;
        loadingMessage = uploadStatus.searching ?
            `Running Pivots` :
            `Uploading Results` ;
    } else if (!datasetName || !datasetType) {
        showLoadingIndicator = false;
        loadingMessage = `Run a Pivot to get started`;
    }

    return (
        <div className={styles['investigation-all']}>
            <div className={styles['investigation-split']}>
                <SplitPane split='vertical' minSize={300} defaultSize={300}>
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
                        className={iframeStyle.iframe}
                        vizClassName={iframeStyle.iframe}
                        {...uiTweaks[activeInvestigation.layout] || {}}
                        showLogo={false}
                        showIcons={true}
                        showToolbar={true}
                        backgroundColor='#eeeeee'
                        axes={axes}
                        controls={controls}
                        type={datasetType}
                        dataset={datasetName}
                        graphistryHost={graphistryHost}
                        loadingMessage={loadingMessage}
                        showLoadingIndicator={showLoadingIndicator}
                        workbook={activeInvestigation.id}
                    />
               </SplitPane>
            </div>
        </div>
    );
}
