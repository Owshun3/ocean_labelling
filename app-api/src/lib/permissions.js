'use strict';

/**
 * Permissions de sanction (ban, désactivation) — règles centralisées.
 *
 * Hiérarchie : admin > moderator > curator ≥ chercheur > annotator > guest.
 * Un acteur ne peut sanctionner que des cibles de rôle STRICTEMENT inférieur
 * au sien — évite guerre de mod, peer-policing entre rôles techniques, et la
 * paralysie du site si un mod compromis bannit tous les curators.
 * Le superuser CVAT est intouchable depuis l'UI (révocation CLI/DB only).
 */

const ROLE_RANK = {
  admin:     5,
  moderator: 4,
  curator:   3,
  chercheur: 3,
  annotator: 1,
  guest:     0,
};

function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

function assertCanSanction(actor, target, action = 'sanctionner') {
  if (Number(actor.id) === Number(target.id)) {
    throw httpError(403, `Tu ne peux pas te ${action} toi-même.`);
  }

  if (target.is_superuser || target.is_staff) {
    throw httpError(403, `Impossible de ${action} un administrateur (compte protégé).`);
  }

  const actorRank  = actor.is_superuser ? ROLE_RANK.admin : roleRank(actor.role);
  const targetRank = roleRank(target.role);
  if (actorRank <= targetRank) {
    throw httpError(403, `Ton rôle ne te permet pas de ${action} un ${target.role} (hiérarchie : seuls les rôles strictement supérieurs peuvent sanctionner).`);
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { roleRank, assertCanSanction, ROLE_RANK };
