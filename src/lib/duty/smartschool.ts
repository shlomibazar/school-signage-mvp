// Future SmartSchool integration for the duty roster: the interface the roster needs from an external
// school system (staff, absences; timetable later), with a mock for development. There is no live
// connection: nothing here calls SmartSchool. A real adapter needs explicit authorization, an agreed
// API and credentials; it would implement this interface, and its records would be stored with
// source SMARTSCHOOL and externalRef = the SmartSchool id (unique per school).
//
// Sync rules for a future adapter: it may create/update only records with source SMARTSCHOOL and
// kind REGULAR. Staff added by hand (kind MANUAL or TEMPORARY, source MANUAL) belong to the roster of
// one school only: they are never sent to SmartSchool, never overwritten or archived by a sync, and a
// later SmartSchool record with the same name is a different record (the admin may archive the
// manual one). Names are never used to match records.

export type ExternalStaff = { externalRef: string; firstName: string; lastName: string; active: boolean }
export type ExternalAbsence = { externalRef: string; date: string; /** HH:mm–HH:mm, or null for the whole day */ from: string | null; to: string | null; reason: string | null }
export type ExternalPeriod = { name: string; startTime: string; endTime: string; weekdays: number[] }

export interface DutyDirectoryAdapter {
  readonly name: string
  listStaff(schoolExternalId: string): Promise<ExternalStaff[]>
  listAbsences(schoolExternalId: string, fromDate: string, toDate: string): Promise<ExternalAbsence[]>
  /** Break times from the school timetable, when the source has them. */
  listBreaks(schoolExternalId: string): Promise<ExternalPeriod[]>
}

/** Development stand-in: fixed sample data, no network. */
export class MockSmartSchoolAdapter implements DutyDirectoryAdapter {
  readonly name = 'smartschool-mock'
  async listStaff(): Promise<ExternalStaff[]> {
    return [
      { externalRef: 'mock-t-1', firstName: 'רונית', lastName: 'לוי', active: true },
      { externalRef: 'mock-t-2', firstName: 'David', lastName: 'Cohen', active: true },
      { externalRef: 'mock-t-3', firstName: 'מיכל', lastName: 'אברהם', active: false },
    ]
  }
  async listAbsences(_school: string, fromDate: string): Promise<ExternalAbsence[]> {
    return [{ externalRef: 'mock-t-1', date: fromDate, from: null, to: null, reason: 'מחלה' }]
  }
  async listBreaks(): Promise<ExternalPeriod[]> {
    return [{ name: 'הפסקה ראשונה', startTime: '10:00', endTime: '10:20', weekdays: [0, 1, 2, 3, 4] }]
  }
}

/** The adapter in use. Only the mock exists; a live adapter must not be added without authorization. */
export function dutyDirectoryAdapter(): DutyDirectoryAdapter {
  return new MockSmartSchoolAdapter()
}
