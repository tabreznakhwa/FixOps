export type WorkOrderAssignment = {
  assigned_to: string | null
  assigned_staff_id: string | null
}

export function isWorkOrderAssignedToTechnician({
  userId,
  staffId,
  workOrder,
}: {
  userId: string
  staffId: string | null
  workOrder: WorkOrderAssignment
}): boolean {
  return workOrder.assigned_to === userId || (
    staffId !== null && workOrder.assigned_staff_id === staffId
  )
}

export function canTechnicianCollectWorkOrderPayment({
  paymentMode,
  userId,
  staffId,
  workOrder,
}: {
  paymentMode: string
  userId: string
  staffId: string | null
  workOrder: WorkOrderAssignment
}): boolean {
  return paymentMode === 'cash' && isWorkOrderAssignedToTechnician({
    userId,
    staffId,
    workOrder,
  })
}
