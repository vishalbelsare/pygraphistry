import React from 'react'
// import styles from './styles.less';
import classNames from 'classnames';
import { container } from '@graphistry/falcor-react-redux';
import { TimebarFragment } from './fragments';
import { Button, Panel, MenuItem, ListGroup, ListGroupItem } from 'react-bootstrap';

export const Timebar = container(
    TimebarFragment
)(({ name, open }) => {
    return  (
        <h3>Timebar</h3>
        // <ListGroup fill>
        // {sets.map((set) => (
        //     <ListGroupItem key={set.key}>
        //         <Set data={set}/>
        //     </ListGroupItem>
        // ))}
        // </ListGroup>
    );
})
