import View from '../../view';

function Workbook({ views = [] } = {}) {
    return <View data={views.current}/>
}

export { Workbook };
export default Workbook;
