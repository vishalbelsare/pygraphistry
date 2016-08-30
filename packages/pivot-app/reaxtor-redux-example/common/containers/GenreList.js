import React from 'react'
import Genre from './Genre';
import { container } from 'reaxtor-redux';

function GenreList({ genres = [] } = {}) {
    const { myList } = genres;
    return (
        <div className='genre-grid'>

            {myList ? (
                <Genre key={myList.key}
                       data={myList} />
            ) : null}

            {genres.filter((genre) => (
                !myList || !genre.is(myList)
            )).map((genre, index) => (
                <Genre key={genre.key}
                       data={genre} />
            ))}
        </div>
    );
}

function renderLoading(props) {
    return (
        <div className='genre-grid'>
            <span>Loading Genres...</span>
        </div>
    );
}

function mapStateToFragment(genrelist = []) {
    let { myList, length = 0 } = genrelist;
    // length = 1;
    return `{
        length,
        [0...${length}]: ${
            Genre.fragment()
        }
    }`;
}

function mapFragmentToProps(genrelist) {
    return { genres: genrelist };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps
)(GenreList);
