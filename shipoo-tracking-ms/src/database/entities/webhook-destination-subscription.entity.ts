import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DomainEventType } from '../../common/enums.js';
import { WebhookDestination } from './webhook-destination.entity.js';

@Entity('webhook_destination_subscriptions')
@Unique(['destinationId', 'eventType'])
export class WebhookDestinationSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'destination_id', type: 'uuid' })
  destinationId!: string;

  @ManyToOne(() => WebhookDestination, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destination_id' })
  destination!: WebhookDestination;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: DomainEventType;
}
