import Helmet from 'react-helmet';
import styles from './styles.less';

const metaTags = [
    { charset: 'utf-8' },
    { 'http-equiv': 'Content-Language', content: 'en' },
    { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no'
    }
];

function App({ params = {}, children = [] } = {}) {
    const { client, dataset, workbook } = params;
    return (
        <div className={styles['app']}>
            <Helmet
                meta={metaTags}
                title={`${dataset || workbook || ''}${client === 'static' ? ' (exported)' : ''}`}
                defaultTitle={`Graphistry's Graph Explorer`}
                titleTemplate={`%s - Graphistry's Graph Explorer`}
            />
            {children}
        </div>
    );
}

export { App };
export default App;
