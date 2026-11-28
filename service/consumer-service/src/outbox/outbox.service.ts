import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { PatientDto } from '../patients/patients.dto';

export interface PatientProfileCreatedEnvelope {
  eventId: string;
  eventType: 'consumer.patient.profile.created.v1';
  eventVersion: 1;
  occurredAt: string;
  producer: 'CONSUMER_SERVICE';
  correlationId: string;
  aggregateId: string;
  aggregateVersion: 1;
  data: {
    patientId: string;
    userId: string | null;
    patientCode: string;
    createdAt: string;
  };
}

/**
 * Writes domain events into `outbox_events` inside the caller's DB transaction.
 */
@Injectable()
export class OutboxService {
  async enqueuePatientProfileCreated(
    client: PoolClient,
    patient: PatientDto,
    correlationId: string,
  ): Promise<string> {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const routingKey = 'consumer.patient.profile.created.v1';

    // Strictly non-PII payload: patientId, userId, patientCode, createdAt only
    const envelope: PatientProfileCreatedEnvelope = {
      eventId,
      eventType: routingKey,
      eventVersion: 1,
      occurredAt,
      producer: 'CONSUMER_SERVICE',
      correlationId,
      aggregateId: patient.patientId,
      aggregateVersion: 1,
      data: {
        patientId: patient.patientId,
        userId: patient.userId,
        patientCode: patient.patientCode,
        createdAt: patient.createdAt,
      },
    };

    const headers = {
      'x-event-id': eventId,
      'x-correlation-id': correlationId,
      'content-type': 'application/json',
    };

    await client.query(
      `INSERT INTO outbox_events (
        event_id, aggregate_type, aggregate_id, aggregate_version,
        event_type, routing_key, payload, headers, occurred_at
      ) VALUES ($1, 'Patient', $2, 1, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz)`,
      [
        eventId,
        patient.patientId,
        routingKey,
        routingKey,
        JSON.stringify(envelope),
        JSON.stringify(headers),
        occurredAt,
      ],
    );

    return eventId;
  }
}
