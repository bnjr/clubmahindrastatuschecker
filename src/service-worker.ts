const PROFILEURL =
  'https://newmembers-api.clubmahindra.com/booking/api/v1/getProfileInfo'
const AVAILABILITYURL =
  'https://newmembers-api.clubmahindra.com/booking/api/v1/getAvailabilityCalendar'

let userLoggedIn = false // To track user login state

let sessionToken = ''
let memberData: { memberId: string; portalCode: string } = {
  memberId: '',
  portalCode: '',
}

let membershipId = ''
let portal = ''
let memberId = ''
let memberApertment = ''
let memberUsagePerDayValue = ''
let memberTypeProfileID = ''
let contractID = ''
let memberSeason = ''

chrome.tabs.onUpdated.addListener(async () => {
  // Allow users to open the sidebar by clicking on the action toolbar icon
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error))
})

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url)
    if (
      details.method === 'POST' &&
      details.requestBody &&
      details.requestBody.raw &&
      memberData.memberId === '' &&
      url.pathname.endsWith('getProfileInfo')
    ) {
      let arrayBuffer = details.requestBody.raw[0]?.bytes
      let dataString = arrayBuffer ? arrayBufferToString(arrayBuffer) : ''
      try {
        memberData = JSON.parse(dataString)
      } catch (e) {
        console.error('Error parsing JSON:', e)
      }
    }
  },
  { urls: ['https://*.clubmahindra.com/*'] },
  ['requestBody']
)

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const url = new URL(details.url)
    if (details.method === 'POST') {
      if (
        url.pathname.endsWith('getProfileDetails') &&
        sessionToken === '' &&
        details.requestHeaders
      ) {
        const headerAuth = details.requestHeaders.find(
          (header) => header.name.toLowerCase() === 'authorization'
        )
        if (headerAuth?.value) {
          sessionToken = headerAuth.value.trim()
          triggerRequest()
        }
      }

      if (url.pathname.endsWith('logout')) {
        membershipId = ''
        portal = ''
        memberId = ''
        memberApertment = ''
        memberUsagePerDayValue = ''
        memberTypeProfileID = ''
        contractID = ''
        memberSeason = ''

        userLoggedIn = false

        sessionToken = ''
        memberData = {
          memberId: '',
          portalCode: '',
        }
        updateSidebar()
      }
    }
  },
  { urls: ['https://*.clubmahindra.com/*'] },
  ['requestHeaders']
)

chrome.runtime.onMessage.addListener((request) => {
  switch (request.command) {
    // Other command handlers...
    case 'checkAvailability':
      request.resorts.forEach((resortId) =>
        checkAvailability(request.startDate, request.endDate, resortId)
      )
      break
    default:
      console.error(`Unknown command: ${request.command}`)
      break
  }
})

function triggerRequest() {
  if (
    sessionToken !== '' &&
    memberData.memberId !== '' &&
    userLoggedIn === false
  )
    fetch(PROFILEURL, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        authorization: sessionToken,
        Referer: 'https://holidays.clubmahindra.com/',
        'Referrer-Policy': 'strict-origin',
      },
      body: JSON.stringify(memberData),
    })
      .then((response) => response.json())
      .then((profileData) => {
        if (profileData.status === 'success' && profileData.data) {
          memberApertment = profileData.data.memberApertment
          // memberUsagePerDayValue = profileData.data.memberUsagePerDayValue
          memberTypeProfileID = profileData.data.memberTypeProfileID
          contractID = profileData.data.contractID
          memberSeason = profileData.data.contractSeason
          membershipId = profileData.data.memberMembershipId
          portal = profileData.data.portalCode
          memberId = profileData.data.memberId
          userLoggedIn = true
          updateSidebar()
        }
      })
      .catch((error) => {
        console.error('Fetch Error:', error)
      })
}

function updateSidebar() {
  let loginState = userLoggedIn
    ? 'User logged in.'
    : 'User is not logged in. Please login via Club Mahindra website.'
  chrome.runtime.sendMessage({ command: 'updateLogin', loginState })

  if (userLoggedIn) {
    fetchResorts()
  } else {
    // Clear the resorts list when the user logs out
    chrome.runtime.sendMessage({ command: 'clearResorts' })
  }
}

function fetchResorts() {
  const url =
    'https://newmembers-api.clubmahindra.com/staticdata/api/v1/getResortFilterCR?portalCode=' +
    portal

  fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `${sessionToken}`,
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    })
    .then((data) => {
      chrome.runtime.sendMessage({ command: 'updateResorts', data: data.data })
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        command: 'updateLogin',
        loginState: `Error fetching resorts: ${error.toString()}`,
      })
    })
}

function checkAvailability(startDate, endDate, crestId) {
  const payload = {
    checkIn: startDate,
    checkOut: endDate,
    crestId: crestId,
    memberSeason: memberSeason,
    memberId: memberId,
    membershipId: membershipId,
    adult: 2,
    child: 0,
    infant: 0,
    apartmentType: memberApertment,
    memberUsagePerDayValue: memberUsagePerDayValue,
    memberProfileId: memberTypeProfileID,
    portalCode: portal,
  }

  fetch(AVAILABILITYURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `${sessionToken}`,
    },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === 'success') {
        const status = determineResortStatus(data.data, startDate, endDate)
        chrome.runtime.sendMessage({
          command: 'updateResortStatus',
          crest_id: crestId,
          status,
        })
      } else {
        throw new Error(data.status)
      }
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        command: 'updateLogin',
        loginState: `Error fetching availability: ${error.toString()}`,
      })
    })
}

function determineResortStatus(data, startDate, endDate) {
  // Assume the status is 'Available' and update if necessary
  let status = 'Available'

  // Convert string dates to Date objects for comparison
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Iterate over each day in the data
  for (let day in data) {
    // Only process the days within the specified date range
    const currentDay = new Date(day)
    if (currentDay >= start && currentDay <= end) {
      let rooms = data[day]
      let available = rooms.some((room) => room.Status === 'A')
      let waitlisted = rooms.some((room) => room.Status === 'N')

      if (!available && !waitlisted) {
        // If there are no rooms available or on waitlist for this day, the resort is 'Sold Out'
        return 'Sold Out'
      } else if (!available && waitlisted && status !== 'Sold Out') {
        // If there are no rooms available but there is a room on waitlist for this day, and the resort is not already 'Sold Out',
        // the resort is on 'Waitlist'
        status = 'Waitlist'
      }
    }
  }

  return status
}

function arrayBufferToString(buffer) {
  let decoder = new TextDecoder('utf-8')
  return decoder.decode(buffer)
}
