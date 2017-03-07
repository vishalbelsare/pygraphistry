import { Option } from '../';
import { Grid, Row, Col } from 'react-bootstrap';

function Options({ name, options = [] } = {}) {
    return (
        <Grid fluid style={{ padding: 0 }}>
        {name &&
            <Row>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <h5 style={{ marginTop: 0 }}>{name}</h5>
                </Col>
            </Row>}
        {options.map((option, index) => (
            <Option data={option} key={`${index}: ${option.id}`}/>
        ))}
        </Grid>
    );
}

export { Options };
export default Options;
