const FIELD_KEYS = {
  schoolId: 'common.school',
  studentName: 'apply.fullName',
  ic: 'common.ic',
  dob: 'apply.dob',
  gender: 'apply.gender',
  classApplied: 'apply.classApplied',
  address: 'apply.address',
  email: 'apply.email',
  phone: 'apply.phone',
  parentName: 'apply.parentName',
  parentEmail: 'apply.parentEmail',
  parentPhone: 'apply.parentPhone',
  education: 'apply.educationHistory',
  reason: 'apply.reason',
  consent: 'apply.consentSection',
  documents: 'apply.documentsSection',
  category: 'common.category',
};

export function fieldLabel(t, field) {
  const key = FIELD_KEYS[field];
  return key ? t(key) : field;
}
