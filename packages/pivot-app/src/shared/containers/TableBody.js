import { container } from 'reaxtor-redux';

function renderTableBody({ name, pivots = [] } = {}) {
    return (
        <div> 
            <div>
                Selected Investigation Name: { name }
            </div>
            <div>
                Number of pivots in investigaiton: { pivots.length }
            </div>
        </div>
    )
}

function mapStateToFragment({ pivots } = {}) {
    return `{
        name,
        pivots: { length }
    }`
}

export default container(
        mapStateToFragment,
        //mapFragmentToProps
)(renderTableBody)

