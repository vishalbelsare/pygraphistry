import Select from 'react-select'
import styles from './investigation-header.less';
import { layouts } from '../../services/layouts';
import {
    Grid, Row, Col,
    Button, ButtonGroup,
    Glyphicon, OverlayTrigger, Tooltip
} from 'react-bootstrap';

export default function InvestigationHeader({
    id, user, layout, children, investigations = [], saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation, saveLayout
}) {
    return (
        <Grid fluid className={styles['investigation-header']}>
            <Row style={{ height: 41 }} className={`${styles['investigation-header-row']} ${styles['investigation-header-nav']}`}>
                <Col className={styles['investigation-header-col']} xs={8} sm={8} md={8} lg={8}>
                    <Select
                        name='investigation-selector'
                        clearable={false}
                        value={id}
                        options={investigations.map((investigation) => ({value: investigation.id, label: investigation.name }))}
                        onChange={(selection) => selectInvestigation(selection.value)}
                    />
                </Col>
                <Col className={styles['investigation-header-col']} xs={4} sm={4} md={4} lg={4}>
                    <ButtonGroup justified className={styles['investigation-header-nav-items']}>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`createInvestigationTooltip`}>Create New Investigation</Tooltip>
                            }>
                            <Button onClick={() => createInvestigation(user.id)}>
                                <Glyphicon glyph="plus" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`copyInvestigationTooltip`}>Copy Investigation</Tooltip>
                            }>
                            <Button onClick={() => copyInvestigation(id)}>
                                <Glyphicon glyph="duplicate" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`saveInvestigationTooltip`}>Save Investigation</Tooltip>
                            }>
                            <Button onClick={() => saveInvestigation(id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </Button>
                        </OverlayTrigger>
                    </ButtonGroup>
                </Col>
            </Row>
            <Row className={styles['investigation-header-row']}>
                <Col xs={12} sm={12} md={12} lg={12} className={styles['layout-picker']}>
                    <Select
                        name="layout-selector"
                        clearable={false}
                        value={layout}
                        options={layouts.filter((lay) => lay.id !== 'insideout').map((lay) => ({value: lay.id, label: lay.friendlyName, className: lay.id}))}
                        onChange={(lay) => saveLayout({layoutType: lay.value})}
                    />
                </Col>
            </Row>
            {children && children.length &&
            <Row className={styles['investigation-header-row']}>
                <Col xs={12} sm={12} md={12} lg={12}>
                    {children}
                </Col>
            </Row> || undefined}
        </Grid>
    );
}
