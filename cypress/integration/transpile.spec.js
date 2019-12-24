/// <reference types="Cypress" />

describe('transpile', () => {
    it('should transpile .kal files', async () => {
        cy
            .visit('/cypress/integration/transpile.html')
            .get('#myText')        
            .should('contain.text', 'Hello World')
    })
})