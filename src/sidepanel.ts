window.onload = () => {
  let selectedResorts: string[] = [] // Array to hold the selected resort's crest_id

  // Default start date to tomorrow
  const startDateInput = document.querySelector(
    '#startDate'
  ) as HTMLInputElement
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  startDateInput.value = tomorrow.toISOString().slice(0, 10)

  const createResortItem = (resort, stateCheckbox) => {
    const resortItem = document.createElement('li')
    resortItem.id = `resortItem${resort.crest_id}`
    const checkbox = document.createElement('input')
    const label = document.createElement('label')

    checkbox.type = 'checkbox'
    checkbox.value = resort.crest_id
    checkbox.id = `resort${resort.crest_id}`

    checkbox.addEventListener('change', (event) => {
      const resortIndex = selectedResorts.indexOf(resort.crest_id)
      if ((event.target as HTMLInputElement).checked) {
        selectedResorts.push(resort.crest_id)
      } else {
        resortIndex > -1 && selectedResorts.splice(resortIndex, 1)
        stateCheckbox.checked = false
      }
    })

    label.htmlFor = `resort${resort.crest_id}`
    label.textContent = resort.resort_name

    resortItem.append(checkbox, label)

    return resortItem
  }

  const createStateCheckbox = (stateResorts) => {
    const stateCheckbox = document.createElement('input')
    stateCheckbox.type = 'checkbox'

    stateCheckbox.addEventListener('change', (event) => {
      // When the state checkbox is toggled, check/uncheck all resort checkboxes
      stateResorts.forEach((resort) => {
        const resortCheckbox = document.querySelector(
          `#resort${resort.crest_id}`
        ) as HTMLInputElement
        if (resortCheckbox) {
          resortCheckbox.checked = (event.target as HTMLInputElement).checked
          const resortIndex = selectedResorts.indexOf(resort.crest_id)
          if (
            (event.target as HTMLInputElement).checked &&
            resortIndex === -1
          ) {
            selectedResorts.push(resort.crest_id)
          } else if (
            !(event.target as HTMLInputElement).checked &&
            resortIndex > -1
          ) {
            selectedResorts.splice(resortIndex, 1)
          }
        }
      })
    })

    return stateCheckbox
  }

  const resetButton = document.querySelector('#resetButton')
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      // Clear resort status
      const statusSpans = document.querySelectorAll('#resortData span')
      statusSpans.forEach((span) => {
        span.remove()
      })

      // Uncheck all resorts
      const checkboxes = document.querySelectorAll(
        '#resortData input[type="checkbox"]'
      ) as NodeListOf<HTMLInputElement>
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false
      })

      // Empty the selectedResorts array
      selectedResorts = []
    })
  }

  const uncheckAllButton = document.querySelector('#uncheckAllButton')
  if (uncheckAllButton) {
    uncheckAllButton.addEventListener('click', () => {
      // Uncheck all resorts
      const checkboxes = document.querySelectorAll(
        '#resortData input[type="checkbox"]'
      ) as NodeListOf<HTMLInputElement>
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false
      })

      // Empty the selectedResorts array
      selectedResorts = []
    })
  }

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.command) {
      case 'updateLogin':
        const loginStateElement = document.querySelector('#loginState')
        const inputSectionElement = document.querySelector(
          '#inputSection'
        ) as HTMLElement
        const resetSectionElement = document.querySelector(
          '#resetSection'
        ) as HTMLElement
        if (loginStateElement && inputSectionElement && resetSectionElement) {
          loginStateElement.textContent = request.loginState
          inputSectionElement.style.display =
            request.loginState === 'User logged in.' ? 'block' : 'none'
          resetSectionElement.style.display =
            request.loginState === 'User logged in.' ? 'flex' : 'none'
        }
        break

      case 'updateResorts':
        const resortDataDiv = document.querySelector('#resortData')
        if (resortDataDiv) {
          resortDataDiv.textContent = ''
        }
        for (const region in request.data) {
          if (region !== 'zoneCount' && region !== 'stateImage') {
            const regionHeader = document.createElement('h2')
            const resortList = document.createElement('ul')

            regionHeader.textContent = region
            resortList.classList.add('resortList')

            for (const state in request.data[region]) {
              const stateHeader = document.createElement('h3')
              const stateCheckbox = createStateCheckbox(
                request.data[region][state]
              ) // Create a checkbox for the state
              stateHeader.textContent = state
              stateHeader.prepend(stateCheckbox) // Add the checkbox to the state header

              // Append the state header to the resort list before appending the resort items
              resortList.append(stateHeader)

              request.data[region][state].forEach(
                (resort) =>
                  resortList.append(createResortItem(resort, stateCheckbox)) // Pass the state checkbox to createResortItem
              )
            }

            resortDataDiv
              ? resortDataDiv.append(regionHeader, resortList)
              : null
          }
        }
        break

      case 'updateResortStatus':
        const resortItem = document.querySelector(
          `#resortItem${request.crest_id}`
        )
        if (resortItem) {
          let statusSpan = resortItem.querySelector('span')
          if (!statusSpan) {
            statusSpan = document.createElement('span')
            const lineBreak = document.createElement('br')
            resortItem.append(lineBreak, statusSpan)
          }

          statusSpan.textContent = ` Status: ${request.status}`

          // Add colors based on status
          switch (request.status) {
            case 'Available':
              statusSpan.style.color = 'green'
              break
            case 'Waitlist':
              statusSpan.style.color = 'orange'
              break
            case 'Sold Out':
              statusSpan.style.color = 'red'
              break
            default:
              statusSpan.style.color = 'black'
          }
        }
        break

      case 'clearResorts':
        {
          const resortDataDiv = document.querySelector('#resortData')
          if (resortDataDiv) {
            resortDataDiv.textContent = ''
          }
        }
        break
    }
  })

  const checkAvailabilityButton = document.querySelector(
    '#checkAvailabilityButton'
  )
  if (checkAvailabilityButton) {
    checkAvailabilityButton.addEventListener('click', () => {
      const startDate = new Date(
        (document.querySelector('#startDate') as HTMLInputElement).value
      )
      const endDate = new Date(
        (document.querySelector('#endDate') as HTMLInputElement).value
      )
      // Set hours, minutes, seconds, and milliseconds to 0 for date comparison
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)
      tomorrow.setHours(0, 0, 0, 0)

      if (startDate < tomorrow)
        return alert('Start date must be no earlier than tomorrow.')
      if (endDate <= startDate)
        return alert('End date must be later than start date.')
      if (selectedResorts.length === 0)
        return alert('Please select at least one resort.')

      chrome.runtime.sendMessage({
        command: 'checkAvailability',
        startDate: startDate.toISOString().slice(0, 10), // Convert back to YYYY-MM-DD format
        endDate: endDate.toISOString().slice(0, 10),
        resorts: selectedResorts,
      })
    })
  }
}
