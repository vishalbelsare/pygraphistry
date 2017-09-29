import MainNav from './main-nav';
import classNames from 'classnames';
import UrlHistory from './url-history';
import ErrorBanner from './error-banner';
import styles from './styles.less';

export default function App({
    ActiveScreen, loading,
    currentUser, serverStatus,
    switchScreen, selectInvestigation
}) {

    const {
        activeScreen = 'home',
        activeInvestigation = {}
    } = currentUser || {};

    return (
        <div className={classNames({
            [styles['show-busy-cursor']]: loading
        })}>
            <UrlHistory activeScreen={activeScreen}
                        switchScreen={switchScreen}
                        activeInvestigation={activeInvestigation}
                        selectInvestigation={selectInvestigation} />
            { serverStatus && !serverStatus.ok &&
                <ErrorBanner serverStatus={serverStatus}/> }
            <MainNav key='nav' activeScreen={activeScreen} switchScreen={switchScreen}>
                <ActiveScreen data={currentUser}
                              switchScreen={switchScreen}
                              selectInvestigation={selectInvestigation}
                              key={`${activeScreen}-screen-component`}/>
            </MainNav>
            {/* <DevTools/> */}
        </div>
    );
}
