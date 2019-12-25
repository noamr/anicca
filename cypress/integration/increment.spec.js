/// <reference types="Cypress" />

describe('increment', () => {
    it('should transpile .kal files', async () => {
        cy
            .visit('/cypress/integration/increment.html')
            .get('#myText')
            .should('be.have.text', '0')
            .get('#button')
            .click()
            .get('#myText')
            .should('be.have.text', '1')
            .click()
            .click()
            .get('#myText')
            .should('be.have.text', '3')
    })
})