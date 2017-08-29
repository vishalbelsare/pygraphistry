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
                        graphistryHost={user.graphistryHost}
                        className={iframeStyle.iframe}
                        vizClassName={iframeStyle.iframe} 
                        allowFullScreen={true}
                        showToolbar={true} 
                        showSplashScreen = {false} 
                        layoutTweaks={ uiTweaks[activeInvestigation.layout] }
                        axes={ activeInvestigation.axes }
                        dataset={activeInvestigation.datasetName}
                        type={activeInvestigation.datasetType}
                        controls={activeInvestigation.controls}
                        backgroundColor="#eeeeee"
                        showIcons={true}
                        loading={ !!activeInvestigation.datasetName }
                        loadingMessage="Run your pivots on the left!"
                    />
               </SplitPane>
            </div>
        </div>
    );
}
