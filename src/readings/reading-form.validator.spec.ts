import { BadRequestException } from '@nestjs/common';
import { validateReadingAnswers } from './reading-form.validator';

const SCHEMA = {
  fields: [
    {
      key: 'question',
      type: 'textarea',
      label: '¿Qué quieres consultar?',
      required: true,
      minLength: 5,
      maxLength: 20,
    },
    {
      key: 'topic',
      type: 'select',
      label: 'Tema',
      required: true,
      options: ['LOVE', 'WORK', 'MONEY'],
    },
    {
      key: 'notes',
      type: 'textarea',
      label: 'Notas',
      required: false,
    },
  ],
};

describe('validateReadingAnswers', () => {
  it('passes when all required fields are present and valid', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, {
        question: 'Should I move?',
        topic: 'WORK',
      }),
    ).not.toThrow();
  });

  it('throws when a required field is missing', () => {
    expect(() => validateReadingAnswers(SCHEMA, { topic: 'WORK' })).toThrow(
      BadRequestException,
    );
  });

  it('throws when a required field is an empty string', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, { question: '', topic: 'WORK' }),
    ).toThrow(BadRequestException);
  });

  it('throws when a string is shorter than minLength', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, { question: 'hi', topic: 'WORK' }),
    ).toThrow(/al menos 5 caracteres/);
  });

  it('throws when a string is longer than maxLength', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, {
        question: 'this question is way too long for the limit',
        topic: 'WORK',
      }),
    ).toThrow(/no puede superar 20 caracteres/);
  });

  it('throws when a select value is not one of the allowed options', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, {
        question: 'Valid question',
        topic: 'NOT_AN_OPTION',
      }),
    ).toThrow(/valor inválido/);
  });

  it('does not require an optional field to be present', () => {
    expect(() =>
      validateReadingAnswers(SCHEMA, {
        question: 'Valid Q',
        topic: 'LOVE',
      }),
    ).not.toThrow();
  });

  it('throws when the schema is not the expected shape', () => {
    expect(() => validateReadingAnswers({ not: 'a schema' }, {})).toThrow(
      BadRequestException,
    );
  });
});
