import { assert } from 'chai';

import {
  createPivotModel,
  serializePivotModel,
  createInvestigationModel,
  serializeInvestigationModel
} from '../../src/shared/models/';

function uniqueId(create) {
  return function() {
    const p1 = create();
    assert.isObject(p1);
    assert.property(p1, 'id');
    assert.notEqual(p1.id, create.id);
  };
}

function serializeNoop(create, serialize) {
  return function() {
    const p1 = create();
    const p2 = create(serialize(p1));
    assert.deepEqual(p1, p2);
  };
}

function noAtoms(create, serializedObject, fields) {
  return function() {
    const model = create(serializedObject);
    fields.forEach(field => {
      const pp = model[field];
      Object.keys(pp).forEach(key => {
        if (typeof pp[key] === 'object') {
          assert.property(pp[key], '$type');
        }
      });
    });
  };
}

describe('Pivots', function() {
  const serializedPivot = serializePivotModel(
    createPivotModel({
      pivotParameters: { foo: { a: 1, b: 2 } }
    })
  );

  it('has unique id', uniqueId(createPivotModel));

  it('serialize + deserialize is a noop', serializeNoop(createPivotModel, serializePivotModel));

  it(
    'deserialize object has refs/atoms',
    noAtoms(createPivotModel, serializedPivot, ['pivotParameters'])
  );

  it('serialized object has no refs/atoms', function() {
    Object.keys(serializedPivot).forEach(key => {
      if (typeof serializedPivot[key] === 'object') {
        assert.notProperty(serializedPivot[key], '$type');
      }
    });

    const pp = serializedPivot.pivotParameters;
    Object.keys(pp).forEach(key => {
      if (typeof pp[key] === 'object') {
        assert.notProperty(pp[key], '$type');
      }
    });
  });
});

describe('Investigations', function() {
  const serializedInv = serializeInvestigationModel(
    createInvestigationModel({
      pivots: ['pivot1', 'pivot2']
    })
  );

  it('has unique id', uniqueId(createInvestigationModel));

  it(
    'serialize + deserialize is a noop',
    serializeNoop(createInvestigationModel, serializeInvestigationModel)
  );

  it(
    'deserialize object has refs/atoms',
    noAtoms(createInvestigationModel, serializedInv, ['pivots'])
  );

  it('serialize object has no refs/atoms', function() {
    Object.keys(serializedInv).forEach(key => {
      if (typeof serializedInv[key] === 'object') {
        assert.notProperty(serializedInv[key], '$type');
      }
    });
  });
});
