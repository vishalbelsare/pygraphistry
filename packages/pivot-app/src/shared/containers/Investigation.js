import { container } from 'reaxtor-redux';

function renderInvestigation({length = 0, name = 'default', pivots = []}) {
    return (
            <div>
                <div>
                    Selected Investigation Name: { name }
                </div>
                <div>
                Number of pivots in investigaiton: { length }
                </div>
            {
                pivots.map((pivot, index) =>
                ( <div key={`${pivot.id}`}> {pivot.id} </div> )
                )
            }
            </div>
        )
}

function mapStateToFragment({length = 0, name = 'default', pivots = []} = {}) {
    return `{
                'name',
                'length',
                [0...${length}]: {
                    'id'
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

