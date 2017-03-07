import Helmet from 'react-helmet';
import styles from './styles.less';
import Workbook from '../../workbook';

function App({ params = {}, workbooks = [] } = {}) {
    const { client, dataset, workbook } = params;
    return (
        <div className={styles['app']}>
            <Helmet title={`${dataset || workbook || ''}${
                              client === 'static' ? ' (exported)' : ''}`}
                    defaultTitle={`Graphistry's Graph Explorer`}
                    titleTemplate={`%s - Graphistry's Graph Explorer`}/>
            <Workbook data={workbooks.open}/>
        </div>
    );
}

export { App };
export default App;
