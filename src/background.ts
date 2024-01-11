const RESORTSURL =
  'https://newmembers-api.clubmahindra.com/staticdata/api/v1/getResortFilterCR?portalCode='
const AVAILABILITYURL =
  'https://newmembers-api.clubmahindra.com/booking/api/v1/getAvailabilityCalendar'

let userLoggedIn = false // To track user login state

let sessionToken = ''

let membershipId = ''
let portal = ''
let memberId = ''
let memberApertment = ''
let memberUsagePerDayValue = ''
let memberTypeProfileID = ''
let contractID = ''
let memberSeason = ''

browser.runtime.onInstalled.addListener(() => {
  browser.browserAction.setBadgeBackgroundColor({ color: '#4688F1' }) // Set the badge color
})

browser.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    if (details.method === 'POST') {
      const url = new URL(details.url)

      if (details.requestHeaders && url.pathname.endsWith('getProfileInfo')) {
        // Session Token
        const headerAuth = details.requestHeaders.find(
          (header) => header.name.toLowerCase() === 'authorization'
        )
        if (headerAuth?.value) {
          sessionToken = headerAuth.value.trim()
        }

        // Member Details
        let filter = browser.webRequest.filterResponseData(details.requestId)
        let decoder = new TextDecoder('utf-8')
        let responseData = ''
        filter.ondata = (event) => {
          let str = decoder.decode(event.data, { stream: true })
          responseData += str // Accumulate the data chunks
          filter.write(event.data)
        }
        filter.onstop = () => {
          try {
            let profileData = JSON.parse(responseData) // Parse the complete response data
            if (
              profileData.status === 'success' &&
              profileData.data &&
              sessionToken !== ''
            ) {
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
          } catch (e) {
            console.error('Error parsing JSON:', e)
          }
          filter.close()
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

        updateSidebar()
      }
    }
  },
  { urls: ['https://*.clubmahindra.com/*'] },
  ['blocking', 'requestHeaders']
)

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

function updateSidebar() {
  let loginState = userLoggedIn
    ? 'User logged in.'
    : 'User is not logged in. Please login via Club Mahindra website.'
  browser.runtime.sendMessage({ command: 'updateLogin', loginState })

  if (userLoggedIn) {
    fetchResorts()
  } else {
    // Clear the resorts list when the user logs out
    browser.runtime.sendMessage({ command: 'clearResorts' })
  }
}

function fetchResorts() {
  const url = RESORTSURL + portal

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
      // Change here: we're now sending the whole data object, not just the resorts.
      browser.runtime.sendMessage({ command: 'updateResorts', data: data.data })
    })
    .catch((error) => {
      browser.runtime.sendMessage({
        command: 'updateLogin',
        loginState: `Error fetching resorts: ${error.toString()}`,
      })
    })
}

function checkAvailability(startDate, endDate, crestId) {
  // Fill in the necessary fields in this object. It will vary depending on your specific setup.
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
        browser.runtime.sendMessage({
          command: 'updateResortStatus',
          crest_id: crestId,
          status,
        })
      } else {
        throw new Error(data.status)
      }
    })
    .catch((error) => {
      browser.runtime.sendMessage({
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
