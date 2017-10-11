import chai from 'chai';
import convict from '../../config';

// Loading chai-enzyme
// chai.use(chaiEnzyme());

// Declare as global variable
// therefore you don't have to declare it in every script
global.should = chai.should();
global.expect = chai.expect;
global.assert = chai.assert;
global.__graphistry_convict_conf__ = convict;

require('../../test/unit.js');
