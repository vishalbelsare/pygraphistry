import _ from 'underscore';
import SplitPane from 'react-split-pane';
import Visualization from './visualization';
import styles from './investigation-screen.less';
import { Investigation } from 'pivot-shared/investigations';


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
                    { activeInvestigation.status &&
                        <Visualization investigation={activeInvestigation}/>
                        || undefined
                    }
               </SplitPane>
            </div>
        </div>
    );
}
