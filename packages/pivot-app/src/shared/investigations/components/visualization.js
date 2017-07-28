import { Image, Glyphicon } from 'react-bootstrap';
import { GraphistryIframe } from './graphistry-iframe';
import { uiTweaks } from '../../services/layouts.js';
import styles from './visualization-styles.less';


export default function VisualizationPanel({ investigation }) {
    const loadingGraph = (
        <div className={styles.visLoader}>
            <span className='Select-loading'/>
        </div>
    );

    const runPivot = (
        <span>
            Run a pivot to get started <Glyphicon glyph="flash" style={{color: '#1FBE76'}}/>
        </span>
    );

    const placeholder = (
        <div className={styles['placeholder-wrapper']}>
            <div className={styles['placeholder-logo']}>
				<Image src="/pivot/img/dark_logo.png" responsive />
			<br></br>
            </div>
			<div className={styles['placeholder-message']}>
				<div className={styles['placeholder-message-inside']}>{
                                    (investigation.status && investigation.status.etling) ?
                                        loadingGraph :
                                        runPivot}
				</div>
			</div>
        </div>
    );

    return (
        investigation.url ?
            <GraphistryIframe src={investigation.url} layoutTweaks={ uiTweaks[investigation.layout] } axes={ investigation.axes } />
            : placeholder
    );
}
