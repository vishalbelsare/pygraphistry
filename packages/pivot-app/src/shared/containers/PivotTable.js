import { container } from '@graphistry/falcor-react-redux';

function renderPivotTable({length = 0, id = 'default', pivots = []}) {
    return (
            <div>
            {
                pivots.map((pivot, index) =>
                ( <div key={`${pivot.id}`}> Pivot Id {pivot.id}, Pivot Lengt, Pivot Length {pivot.length} </div> )
                )
            }
            </div>
        )
}

function mapStateToFragment({length = 0} = {}) {
    console.log('Arguemts in pivots Table', arguments)
    console.log('Length', length)
    return `{
                'id',
                'length'
            }`;
    //return `{
                //'id',
                //'length',
                //[0...${length}]: {
                    //'name'
                //}
            //}`;
}

//function mapFragmentToProps(fragment) {
    //const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    //return output;
//}

export default container(
        mapStateToFragment,
        //mapFragmentToProps
)(renderPivotTable)

