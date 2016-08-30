import React from 'react'
import DevTools from './DevTools';
import GenreList from './GenreList';
import { Observable } from 'rxjs';
import { container } from 'reaxtor-redux';

function App({title = "Title not defined", url = 'default url'}) {
    return (
        <div> Title {title} </div>
        )
    //return (
        //<div className='genre-app'>{title ?
            //<GenreList data={genrelist}/>
            //: null}
            //<DevTools/>
        //</div>
    //);
}

//function renderLoading(props) {
    //return (
        //<div className='genre-app'>
            //<span>Loading Netflix...</span>
        //</div>
    //);
//}

function mapStateToFragment(state) {
    console.log(state);
    return `{ title }`
    //return `{ title, url }`;
}

export default container(
    mapStateToFragment
)(App);
