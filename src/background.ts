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
  browser.browserAction.setBadgeBackgroundColor({color: '#4688F1'}) // Set the badge color
})

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (
      details.method === 'GET' &&
      details.url.includes('https://holidays.clubmahindra.com/ssoLoginCMH')
    ) {
      const url = new URL(details.url)
      const token = url.searchParams.get('token')
      if (token) {
        // Make a POST request to verify the token
        fetch(
          'https://newmembers-api.clubmahindra.com/booking/api/v1/verifySSOToken',
          {
            method: 'POST',
            body: JSON.stringify({token}),
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
          .then((response) => response.json())
          .then((data) => {
            if (data.status === 'success' && data.data) {
              sessionToken = 'Bearer ' + data.data.session_token
              membershipId = data.data.gaData.membership_id
              portal = data.data.gaData.portal
              memberId = data.data.memberId
              userLoggedIn = true

              return fetch(
                'https://newmembers-api.clubmahindra.com/booking/api/v1/getProfileInfo',
                {
                  method: 'POST',
                  body: JSON.stringify({
                    memberId,
                    portalCode: portal,
                    contracts: [],
                  }),
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `${sessionToken}`,
                  },
                }
              )
            } else {
              throw new Error('Call to verifySSOToken Failed')
            }
          })
          .then((profileResponse) => profileResponse.json())
          .then((profileData) => {
            if (profileData.status === 'success' && profileData.data) {
              memberApertment = profileData.data.memberApertment
              memberUsagePerDayValue = profileData.data.memberUsagePerDayValue
              memberTypeProfileID = profileData.data.memberTypeProfileID
              contractID = profileData.data.contractID
              memberSeason = profileData.data.memberSeason
              updateSidebar()
            }
          })
          .catch((error) => {
            console.error('Error:', error)
            sessionToken = ''
            membershipId = ''
            portal = ''
            memberId = ''
            memberApertment = ''
            memberUsagePerDayValue = ''
            memberTypeProfileID = ''
            contractID = ''
            memberSeason = ''
            userLoggedIn = false
            updateSidebar()
          })
      }
    }
  },
  {urls: ['https://*.clubmahindra.com/*']}
)

browser.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    let url = new URL(details.url)

    if (url.pathname.endsWith('/logout')) {
      // Matches '/logout' at the end of the URL path
      // Handle logout
      if (userLoggedIn) {
        // Only update sidebar if user was logged in
        sessionToken = ''
        membershipId = ''
        portal = ''
        memberId = ''
        memberApertment = ''
        memberUsagePerDayValue = ''
        memberTypeProfileID = ''
        contractID = ''
        memberSeason = ''
        userLoggedIn = false
        updateSidebar()
      }
    } else {
      return
    }
  },
  {urls: ['https://*.clubmahindra.com/*']},
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
  browser.runtime.sendMessage({command: 'updateLogin', loginState})

  if (userLoggedIn) {
    fetchResorts()
  } else {
    // Clear the resorts list when the user logs out
    browser.runtime.sendMessage({command: 'clearResorts'})
  }
}

function fetchResorts() {
  const url =
    'https://newmembers-api.clubmahindra.com/staticdata/api/v1/getResortFilterCR?portalCode=' + portal

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
      browser.runtime.sendMessage({command: 'updateResorts', data: data.data})
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

  fetch(
    'https://newmembers-api.clubmahindra.com/booking/api/v1/getAvailabilityCalendar',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${sessionToken}`,
      },
      body: JSON.stringify(payload),
    }
  )
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
