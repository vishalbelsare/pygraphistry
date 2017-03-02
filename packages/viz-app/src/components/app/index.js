import Helmet from 'react-helmet';
import styles from './styles.less';

function App({ params = {}, children = [] } = {}) {
    const { client, dataset, workbook } = params;
    return (
        <div className={styles['app']}>
            <Helmet title={`${dataset || workbook || ''}${
                              client === 'static' ? ' (exported)' : ''}`}
                    defaultTitle={`Graphistry's Graph Explorer`}
                    titleTemplate={`%s - Graphistry's Graph Explorer`}/>
            {children}
        </div>
    );
}

export { App };
export default App;
