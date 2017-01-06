import _ from 'underscore';
import SplitPane from 'react-split-pane';
import Visualization from './visualization';
import styles from 'pivot-shared/styles.less';
import navStyles from 'pivot-shared/main/components/styles.less';
import { Investigation } from 'pivot-shared/investigations';

export default function InvestigationScreen({
    templates = [],
    investigations = [],
    activeInvestigation = {},
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
            <div className={styles['investigation-split']}>
                <SplitPane split="vertical" defaultSize="25%" minSize={0}>
                    <Investigation
                        data={activeInvestigation}
                        investigations={investigations}
                        templates={relevantTemplates}
                    />
                    { activeInvestigation.status &&
                        <Visualization investigation={activeInvestigation}/>
                        || undefined
                    }
               </SplitPane>
            </div>
        </div>
    );
}
