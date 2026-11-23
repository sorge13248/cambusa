import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service.js';
import { AuthService } from '../../core/auth.service.js';
import {
  HouseholdInvitationDto,
  HouseholdMemberDto,
  ReceivedInvitationDto,
  UserHouseholdSummary,
} from '../../core/models.js';
import { HouseholdFormModalComponent } from './household-form-modal/household-form-modal.component.js';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component.js';

@Component({
  selector: 'app-households',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './households.component.html',
  styleUrl: './households.component.scss',
})
export class HouseholdsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);

  readonly members = signal<HouseholdMemberDto[]>([]);
  readonly sentInvitations = signal<HouseholdInvitationDto[]>([]);
  readonly receivedInvitations = signal<ReceivedInvitationDto[]>([]);

  inviteEmail = '';

  constructor() {
    effect(() => {
      const hhId = this.auth.activeHouseholdId();
      if (hhId) {
        this.loadHouseholdDetails(hhId);
      }
    });
  }

  ngOnInit() {
    const hhId = this.auth.activeHouseholdId();
    if (hhId) {
      this.loadHouseholdDetails(hhId);
    }
    this.loadReceivedInvitations();
  }

  async loadHouseholdDetails(hhId: string) {
    try {
      const [mems, invites] = await Promise.all([
        this.api.getHouseholdMembers(hhId),
        this.api.getSentInvitations(hhId),
      ]);
      this.members.set(mems);
      this.sentInvitations.set(invites);
    } catch (err) {
      console.error('Error loading household details:', err);
    }
  }

  async loadReceivedInvitations() {
    try {
      const list = await this.api.getReceivedInvitations();
      this.receivedInvitations.set(list);
    } catch (err) {
      console.error('Error loading received invitations:', err);
    }
  }

  switchHousehold(id: string) {
    this.auth.switchHousehold(id);
  }

  openCreateModal() {
    const dialogRef = this.dialog.open(HouseholdFormModalComponent, {
      data: {},
    });

    firstValueFrom(dialogRef.closed).then(async (created) => {
      if (created) {
        await this.auth.init();
      }
    });
  }

  openRenameModal(hh: UserHouseholdSummary) {
    const dialogRef = this.dialog.open(HouseholdFormModalComponent, {
      data: { householdId: hh.id, currentName: hh.name },
    });

    firstValueFrom(dialogRef.closed).then(async (updated) => {
      if (updated) {
        await this.auth.init();
      }
    });
  }

  async confirmDeleteHousehold(hh: UserHouseholdSummary) {
    const dialogRef = this.dialog.open<boolean>(ConfirmModalComponent, {
      data: {
        title: 'Delete Household',
        message: `Are you sure you want to delete "${hh.name}"? All associated products, stock, shopping lists, and member associations will be permanently removed.`,
        confirmLabel: 'Delete Household',
        confirmVariant: 'danger',
      },
    });

    const confirmed = await firstValueFrom(dialogRef.closed);
    if (confirmed) {
      await this.api.deleteHousehold(hh.id);
      await this.auth.init();
    }
  }

  async sendInvite() {
    if (!this.inviteEmail.trim()) return;

    const hhId = this.auth.activeHouseholdId();
    if (!hhId) return;

    try {
      await this.api.sendInvitation(hhId, this.inviteEmail.trim());
      this.inviteEmail = '';
      const invites = await this.api.getSentInvitations(hhId);
      this.sentInvitations.set(invites);
    } catch (err) {
      console.error('Failed to send invitation:', err);
    }
  }

  async revokeInvite(invitationId: string) {
    const hhId = this.auth.activeHouseholdId();
    if (!hhId) return;

    await this.api.revokeInvitation(hhId, invitationId);
    const invites = await this.api.getSentInvitations(hhId);
    this.sentInvitations.set(invites);
  }

  async respondInvitation(invitationId: string, accept: boolean) {
    await this.api.respondToInvitation(invitationId, accept);
    await this.loadReceivedInvitations();
    if (accept) {
      await this.auth.init();
    }
  }
}
