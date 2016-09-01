import { container } from 'reaxtor-redux';

function renderTableBody({ pivots = [] } = {}) {
    console.log(pivots);
    return (
        <div>
            Selected Investigation Name: {pivots.length}
        </div>
    )
}

function mapStateToFragment({ pivots } = {}) {
    console.log("In Table body", pivots );
    return `{
        pivots: { length }
    }`
}

export default container(
        mapStateToFragment,
        //mapFragmentToProps
)(renderTableBody)

