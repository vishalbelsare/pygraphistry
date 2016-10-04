import Sidebar from './Sidebar.js';
import { container } from '@graphistry/falcor-react-redux';
import styles from './styles.less';


function renderHomeScreen() {
    return (
        <div className="wrapper">
            <Sidebar activeScreen='home'/>

            <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>
                {'I am the home screen!'}
            </div>
        </div>
    );
}

export default container(
    () => `{'title'}`,
    (state) => state,
    {}
)(renderHomeScreen);
