import { BadRequestException } from '@nestjs/common';

interface DynamicFormField {
  key: string;
  label: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  options?: string[];
}

interface DynamicFormSchema {
  fields: DynamicFormField[];
}

function isDynamicFormSchema(schema: unknown): schema is DynamicFormSchema {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    Array.isArray((schema as DynamicFormSchema).fields)
  );
}

export function validateReadingAnswers(
  schema: unknown,
  answers: Record<string, unknown>,
): void {
  if (!isDynamicFormSchema(schema)) {
    throw new BadRequestException(
      'El formulario de este servicio no está disponible.',
    );
  }

  for (const field of schema.fields) {
    const value = answers[field.key];
    const isEmpty = value === undefined || value === null || value === '';

    if (field.required && isEmpty) {
      throw new BadRequestException(
        `El campo "${field.label}" es obligatorio.`,
      );
    }

    if (isEmpty) {
      continue;
    }

    if (typeof value === 'string') {
      if (field.minLength !== undefined && value.length < field.minLength) {
        throw new BadRequestException(
          `El campo "${field.label}" debe tener al menos ${field.minLength} caracteres.`,
        );
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        throw new BadRequestException(
          `El campo "${field.label}" no puede superar ${field.maxLength} caracteres.`,
        );
      }
      if (field.options && !field.options.includes(value)) {
        throw new BadRequestException(
          `El campo "${field.label}" tiene un valor inválido.`,
        );
      }
    }
  }
}
