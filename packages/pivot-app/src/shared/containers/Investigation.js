import { container } from 'reaxtor-redux';
import PivotRow from './PivotRow';
import PivotTable from './PivotTable';

function renderInvestigation({length = 0, name = 'default', pivots = []}) {
    return (
            <div>
                <div>
                    Selected Investigation Name: { name }
                </div>
                <div>
                Number of pivots in investigaiton: { length }
                </div>
                <div>
                {
                    pivots.map((pivot, index) => (
                        (<PivotRow key={`${pivot.id}`} data={pivot} />)
                    ))
                }
                </div>
            </div>
        )
}

function mapStateToFragment({selectedInvestigation = {}, length = 0, name = 'default', ...rest} = {}) {
    return `{
                'name',
                'length',
                [0...${length}]: ${
                    PivotRow.fragment()
                }
            }`;
}

function mapFragmentToProps(fragment) {
    const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    return output;
}

export default container(
        mapStateToFragment,
        mapFragmentToProps
)(renderInvestigation)

