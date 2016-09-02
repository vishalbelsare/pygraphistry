import { container } from 'reaxtor-redux';

function renderPivotRow({id, length, fields}) {
    return (
        <div>
            <div> Pivot Id: {id}, Length of pivot: {length} </div>
            <div>
            {
                fields.map((field, index) =>
                    <div key={`${id}: ${index}`}> {field.value} </div>
                )
            }
            </div>
        </div>
        );
}

function mapStateToFragment({length = 0} = {}) {
    return `{
                'id',
                'length',
                [0...${length}]: {
                    value
                }
            }`;
}

function mapFragmentToProps(fragment) {
    //const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    //console.log('output', output);
    const {id, length } = fragment;
    return {id, length, fields:fragment};
}

export default container(
        mapStateToFragment,
        mapFragmentToProps
)(renderPivotRow);

