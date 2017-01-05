import _ from 'underscore';
import SplitPane from 'react-split-pane';
import Visualization from './visualization';
import styles from 'pivot-shared/styles.less';
import navStyles from 'pivot-shared/main/components/styles.less';
import { Investigation, InvestigationHeader } from 'pivot-shared/investigations';

export default function InvestigationScreen({
    user = {},
    templates = [],
    investigations = [],
    activeInvestigation = {},
    copyInvestigation, saveInvestigation,
    selectInvestigation, createInvestigation,
}) {

    const { tags: activeTags = [] } = activeInvestigation || {};

    const relevantTemplates =
        activeTags.length > 0 ?
            templates.filter(({ tags: templateTags = [] }) =>
                _.intersection(templateTags, activeTags).length > 0
            ) :
            templates;

    return (
        <div className={`${navStyles['main-panel']} ${styles['investigation-all']}`}>
            <InvestigationHeader user={user}
                                 data={activeInvestigation}
                                 investigations={investigations}
                                 copyInvestigation={copyInvestigation}
                                 saveInvestigation={saveInvestigation}
                                 activeInvestigation={activeInvestigation}
                                 createInvestigation={createInvestigation}
                                 selectInvestigation={selectInvestigation}
                                 />
            <div className={styles['investigation-split']}>
                <SplitPane split="vertical" defaultSize="25%" minSize={0}>
                    <Investigation data={activeInvestigation} templates={relevantTemplates}/>
                    { activeInvestigation.status &&
                        <Visualization investigation={activeInvestigation}/>
                        || undefined
                    }
               </SplitPane>
            </div>
        </div>
    );
}
