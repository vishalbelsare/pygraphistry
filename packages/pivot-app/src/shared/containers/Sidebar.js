import { container } from '@graphistry/falcor-react-redux';
import { switchScreen } from '../actions/app.js';
import styles from './styles.less';

function renderSidebar({activeScreen, switchScreen}) {
    function active(target) {
        return activeScreen === target ? 'active' : '';
    }

    return (
        <div className={`sidebar ${styles['left-nav']}`} data-color="blue" id="left-nav">
            <div className="sidebar-wrapper">
                <div className={styles.logo}>
                    <div>
                        <img src="/img/logo.png"/>
                    </div>
                </div>
                <ul className="nav">
                    <li className={active('home')}>
                        <a href="#" onClick={() => switchScreen('home')}>
                            <i className="pe-7s-user"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    {/*<li>
                        <a href="#">
                            <i className="pe-7s-users"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#">
                            <i className="pe-7s-note2"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>*/}
                    <li className={active('investigation')}>
                        <a href="#" onClick={() => switchScreen('investigation')}>
                            <i className="pe-7s-graph1"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    {/*}<li>
                        <a href="#">
                            <i className="pe-7s-network"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li> */}
                    <li className={active('connectors')}>
                        <a href="#" onClick={() => switchScreen('connectors')}>
                            <i className="pe-7s-plugin"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    {/*}<li>
                        <a href="#" className="new-investigation">
                            <i className="pe-7s-plus"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li> */}

                </ul>
            </div>
        </div>
    );
}

export default container(
    () => `{title}`,
    (state) => state,
    {
        switchScreen: switchScreen
    }
)(renderSidebar);
